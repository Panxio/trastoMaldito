import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { type CarritoVista, type Pedido } from './api';
import { formatoPrecio } from './reliquias';
import { useApi } from './sesion';

export function Pago() {
  const api = useApi();
  const navigate = useNavigate();
  const [carrito, setCarrito] = useState<CarritoVista | null>(null);
  const [cargando, setCargando] = useState(true);
  const [numero, setNumero] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

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

  async function pagar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Los espacios son solo de lectura: la API exige exactamente 16 dígitos (M5).
    const digitos = numero.replace(/\s/g, '');
    if (!/^\d{16}$/.test(digitos)) {
      setMensaje('La tarjeta debe tener 16 dígitos.');
      return;
    }
    setEnviando(true);
    setMensaje(null);
    const r = await api<Pedido>('/checkout', { metodo: 'POST', cuerpo: { card_number: digitos } });
    if (r.ok) {
      navigate(`/pedidos/${r.datos.id}`);
      return;
    }
    setEnviando(false);
    setMensaje(r.mensaje);
  }

  const unidades = carrito?.items.reduce((suma, l) => suma + l.qty, 0) ?? 0;

  return (
    <section className="mx-auto max-w-2xl space-y-8 px-4 pt-12 sm:px-6">
      <h1 className="text-5xl">Pagar</h1>

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
        <>
          <dl className="voz-terminal space-y-3 border border-hueso/10 bg-tinta p-5 text-sm">
            <div className="flex justify-between">
              <dt className="text-hueso/70">Artículos</dt>
              <dd>{unidades}</dd>
            </div>
            {carrito.discount_clp > 0 && (
              <div className="flex justify-between text-espectro">
                <dt>Descuento</dt>
                <dd>−{formatoPrecio(carrito.discount_clp)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-hueso/10 pt-3 text-lg text-ambar">
              <dt>Total a pagar</dt>
              <dd>{formatoPrecio(carrito.total_clp)}</dd>
            </div>
          </dl>

          {mensaje && (
            <p role="alert" className="voz-terminal text-sm text-sangre">
              {mensaje}
            </p>
          )}

          <form onSubmit={pagar} className="max-w-md space-y-5">
            <div>
              <label htmlFor="tarjeta" className="voz-terminal mb-1 block text-sm text-hueso/70">
                Número de tarjeta
              </label>
              <input
                id="tarjeta"
                required
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="0000 0000 0000 0000"
                maxLength={19}
                aria-describedby="ayuda-tarjeta"
                className="campo"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
              />
              <p id="ayuda-tarjeta" className="voz-terminal mt-1 text-xs text-hueso/60">
                16 dígitos. Los espacios se ignoran.
              </p>
            </div>
            <button type="submit" disabled={enviando} className="boton boton-primario">
              Pagar ahora
            </button>
          </form>
        </>
      )}

      {!carrito && mensaje && (
        <p role="alert" className="voz-terminal text-sm text-sangre">
          {mensaje}
        </p>
      )}
    </section>
  );
}
