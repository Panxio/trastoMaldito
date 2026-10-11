import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { type Pedido } from './api';
import { fechaLegible, formatoPrecio } from './reliquias';
import { useApi } from './sesion';

const ESTADO: Record<Pedido['status'], string> = { pending: 'pendiente', paid: 'pagado', failed: 'fallido' };

type EstadoPedidos = { fase: 'cargando' } | { fase: 'error'; mensaje: string } | { fase: 'listo'; pedidos: Pedido[] };

export function ListaPedidos() {
  const api = useApi();
  const [estado, setEstado] = useState<EstadoPedidos>({ fase: 'cargando' });

  useEffect(() => {
    let vigente = true;
    api<{ items: Pedido[] }>('/orders').then((r) => {
      if (!vigente) return;
      setEstado(r.ok ? { fase: 'listo', pedidos: r.datos.items } : { fase: 'error', mensaje: r.mensaje });
    });
    return () => {
      vigente = false;
    };
  }, [api]);

  return (
    <section className="mx-auto max-w-6xl space-y-8 px-4 pt-12 sm:px-6">
      <h1 className="text-5xl">Pedidos</h1>

      {estado.fase === 'cargando' && <p className="voz-terminal text-hueso/70">Cargando…</p>}
      {estado.fase === 'error' && (
        <p role="alert" className="voz-terminal text-sangre">
          {estado.mensaje}
        </p>
      )}
      {estado.fase === 'listo' && estado.pedidos.length === 0 && <p className="voz-terminal text-hueso/70">Todavía no tienes pedidos.</p>}
      {estado.fase === 'listo' && estado.pedidos.length > 0 && (
        <ul className="divide-y divide-hueso/10 border-y border-hueso/10">
          {estado.pedidos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 py-5">
              <Link to={`/pedidos/${p.id}`} className="text-xl underline-offset-4 hover:text-espectro hover:underline">
                Pedido {p.id}
              </Link>
              <span className="voz-terminal text-sm text-hueso/60">{fechaLegible(p.created_at)}</span>
              <span className="voz-terminal text-sm">{ESTADO[p.status]}</span>
              <span className="voz-terminal text-ambar">{formatoPrecio(p.total_clp)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type EstadoDetalle = { fase: 'cargando' } | { fase: 'error'; mensaje: string } | { fase: 'listo'; pedido: Pedido };

export function DetallePedido() {
  const { id = '' } = useParams();
  const api = useApi();
  const [estado, setEstado] = useState<EstadoDetalle>({ fase: 'cargando' });

  useEffect(() => {
    let vigente = true;
    setEstado({ fase: 'cargando' });
    api<Pedido>(`/orders/${encodeURIComponent(id)}`).then((r) => {
      if (!vigente) return;
      setEstado(r.ok ? { fase: 'listo', pedido: r.datos } : { fase: 'error', mensaje: r.mensaje });
    });
    return () => {
      vigente = false;
    };
  }, [api, id]);

  return (
    <section className="mx-auto max-w-3xl space-y-8 px-4 pt-12 sm:px-6">
      <Link to="/pedidos" className="voz-terminal text-sm text-espectro underline-offset-4 hover:underline">
        Volver a pedidos
      </Link>

      {estado.fase === 'cargando' && <p className="voz-terminal text-hueso/70">Cargando…</p>}
      {estado.fase === 'error' && (
        <p role="alert" className="voz-terminal text-sangre">
          {estado.mensaje}
        </p>
      )}

      {estado.fase === 'listo' && (
        <>
          <div className="space-y-2">
            <h1 className="text-4xl sm:text-5xl">Pedido {estado.pedido.id}</h1>
            <p className="voz-terminal text-sm text-hueso/60">{fechaLegible(estado.pedido.created_at)}</p>
            <p className="voz-terminal text-sm">Estado: {ESTADO[estado.pedido.status]}</p>
          </div>

          <ul className="divide-y divide-hueso/10 border-y border-hueso/10">
            {estado.pedido.items.map((l) => (
              <li key={l.relic_id} className="flex items-baseline justify-between gap-4 py-4">
                <div className="space-y-1">
                  <p className="text-lg">{l.name}</p>
                  <p className="voz-terminal text-sm text-hueso/60">
                    {l.qty} × {formatoPrecio(l.price_clp)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="voz-terminal flex justify-between text-lg text-ambar">
            <span>Total</span>
            <span>{formatoPrecio(estado.pedido.total_clp)}</span>
          </div>
        </>
      )}
    </section>
  );
}
