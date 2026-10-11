import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { type CarritoVista, type OpcionesPeticion } from './api';
import { formatoPrecio } from './reliquias';
import { useApi } from './sesion';

export function Carrito() {
  const api = useApi();
  const [carrito, setCarrito] = useState<CarritoVista | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');

  useEffect(() => {
    let vigente = true;
    api<CarritoVista>('/cart').then((r) => {
      if (!vigente) return;
      if (r.ok) setCarrito(r.datos);
      else setMensaje(r.mensaje);
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, [api]);

  // Cada cambio devuelve el carrito completo (precios y descuentos los calcula la API): se reemplaza entero.
  async function mutar(ruta: string, opciones?: Omit<OpcionesPeticion, 'token'>): Promise<boolean> {
    setOcupado(true);
    setMensaje(null);
    const r = await api<CarritoVista>(ruta, opciones);
    setOcupado(false);
    if (r.ok) {
      setCarrito(r.datos);
      return true;
    }
    setMensaje(r.mensaje);
    return false;
  }

  function cambiarCantidad(relicId: number, actual: number, valor: string) {
    const qty = Number(valor);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99 || qty === actual) return;
    mutar(`/cart/items/${relicId}`, { metodo: 'PUT', cuerpo: { qty } });
  }

  async function aplicarCupon(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (await mutar('/cart/coupon', { metodo: 'POST', cuerpo: { code: codigo.trim() } })) setCodigo('');
  }

  return (
    <section className="mx-auto max-w-6xl space-y-8 px-4 pt-12 sm:px-6">
      <h1 className="text-5xl">Carrito</h1>

      {mensaje && (
        <p role="alert" className="voz-terminal text-sm text-sangre">
          {mensaje}
        </p>
      )}
      {cargando && <p className="voz-terminal text-hueso/70">Cargando…</p>}

      {carrito && carrito.items.length === 0 && (
        <div className="space-y-4">
          <p className="text-2xl">Tu carrito está vacío</p>
          <Link to="/catalogo" className="voz-terminal text-sm text-espectro underline-offset-4 hover:underline">
            Ver el catálogo
          </Link>
        </div>
      )}

      {carrito && carrito.items.length > 0 && (
        <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-8">
            <ul className="divide-y divide-hueso/10 border-y border-hueso/10">
              {carrito.items.map((l) => (
                <li key={l.relic_id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                  <div className="space-y-1">
                    <p className="text-xl">{l.name}</p>
                    <p className="voz-terminal text-sm text-hueso/60">{formatoPrecio(l.price_clp)} c/u</p>
                  </div>
                  <div className="voz-terminal flex items-center gap-5 text-sm">
                    <input
                      type="number"
                      aria-label={`Cantidad de ${l.name}`}
                      min={1}
                      max={99}
                      value={l.qty}
                      disabled={ocupado}
                      onChange={(e) => cambiarCantidad(l.relic_id, l.qty, e.target.value)}
                      className="campo w-24"
                    />
                    <p className="w-28 text-right text-hueso">{formatoPrecio(l.subtotal_clp)}</p>
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => mutar(`/cart/items/${l.relic_id}`, { metodo: 'DELETE' })}
                      className="text-sangre underline-offset-4 hover:underline disabled:opacity-50"
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="max-w-xl space-y-4">
              <form onSubmit={aplicarCupon} className="flex items-end gap-3">
                <div className="flex-1">
                  <label htmlFor="cupon" className="voz-terminal mb-1 block text-sm text-hueso/70">
                    Código de cupón
                  </label>
                  <input id="cupon" required maxLength={40} className="campo" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
                </div>
                <button type="submit" disabled={ocupado} className="boton boton-contorno">
                  Aplicar cupón
                </button>
              </form>

              {carrito.coupon && (
                <div className="voz-terminal flex items-baseline justify-between gap-4 text-sm">
                  <p className="text-hueso/80">
                    Cupón {carrito.coupon.code} ({carrito.coupon.discount_pct} %)
                  </p>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => mutar('/cart/coupon', { metodo: 'DELETE' })}
                    className="text-sangre underline-offset-4 hover:underline disabled:opacity-50"
                  >
                    Quitar cupón
                  </button>
                </div>
              )}
            </div>
          </div>

          <aside className="voz-terminal h-fit space-y-4 border border-hueso/10 bg-tinta p-5 text-sm">
            <div className="flex justify-between">
              <span className="text-hueso/70">Subtotal</span>
              <span>{formatoPrecio(carrito.subtotal_clp)}</span>
            </div>
            {carrito.discount_clp > 0 && (
              <div className="flex justify-between text-espectro">
                <span>Descuento</span>
                <span>−{formatoPrecio(carrito.discount_clp)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-hueso/10 pt-4 text-lg text-ambar">
              <span>Total</span>
              <span>{formatoPrecio(carrito.total_clp)}</span>
            </div>
            <Link to="/pago" className="boton boton-primario w-full">
              Pagar
            </Link>
          </aside>
        </div>
      )}
    </section>
  );
}
