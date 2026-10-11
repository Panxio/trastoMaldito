import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { type CarritoVista } from './api';
import { formatoPrecio, pedirReliquias, type EstadoLista, type Relic } from './reliquias';
import { Resenas } from './Resenas';
import { useApi, useSesion } from './sesion';

export { formatoPrecio, type Relic };

// Tarjeta de producto: el nombre es el único enlace; su área se extiende a toda la tarjeta.
export function TarjetaReliquia({ relic }: { relic: Relic }) {
  const agotada = relic.stock <= 0;
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded border border-hueso/10 bg-tinta transition-colors hover:border-espectro/60">
      <div className="aspect-square bg-vacio">
        {relic.image_url && <img src={relic.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-xl">
          <Link to={`/catalogo/${relic.id}`} className="after:absolute after:inset-0">
            {relic.name}
          </Link>
        </h3>
        <p className="voz-terminal mt-auto flex items-baseline justify-between gap-2 text-sm">
          <span className="text-ambar">{formatoPrecio(relic.price_clp)}</span>
          {agotada ? <span className="text-sangre">agotado</span> : <span className="text-hueso/60">quedan {relic.stock}</span>}
        </p>
      </div>
    </article>
  );
}

export function Catalogo() {
  const [texto, setTexto] = useState('');
  // Lo último enviado con el formulario; cada cambio dispara una petición.
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<EstadoLista>({ fase: 'cargando' });

  useEffect(() => {
    let vigente = true;
    setEstado({ fase: 'cargando' });
    pedirReliquias(busqueda).then((nuevo) => {
      if (vigente) setEstado(nuevo);
    });
    return () => {
      vigente = false;
    };
  }, [busqueda]);

  function buscar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusqueda(texto);
  }

  return (
    <section className="mx-auto max-w-6xl space-y-8 px-4 pt-12 sm:px-6">
      <h1 className="text-5xl">Catálogo</h1>

      <form onSubmit={buscar} className="flex max-w-xl items-end gap-3">
        <div className="flex-1">
          <label htmlFor="buscar" className="voz-terminal mb-1 block text-sm text-hueso/70">
            Buscar
          </label>
          <input id="buscar" type="search" value={texto} maxLength={100} onChange={(e) => setTexto(e.target.value)} className="campo" />
        </div>
        <button type="submit" className="boton boton-contorno">
          Buscar
        </button>
      </form>

      {estado.fase === 'cargando' && <p className="voz-terminal text-hueso/70">Cargando…</p>}
      {estado.fase === 'error' && (
        <p role="alert" className="voz-terminal text-sangre">
          No se pudo cargar el catálogo.
        </p>
      )}
      {estado.fase === 'listo' && estado.items.length === 0 && <p className="voz-terminal text-hueso/70">Sin resultados</p>}
      {estado.fase === 'listo' && estado.items.length > 0 && (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {estado.items.map((r) => (
            <li key={r.id}>
              <TarjetaReliquia relic={r} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type EstadoFicha =
  | { fase: 'cargando' }
  | { fase: 'no-encontrada' }
  | { fase: 'error' }
  | { fase: 'listo'; relic: Relic };

async function pedirReliquia(id: string): Promise<EstadoFicha> {
  try {
    const res = await fetch(`/api/v2/relics/${encodeURIComponent(id)}`);
    if (res.status === 404) return { fase: 'no-encontrada' };
    if (!res.ok) return { fase: 'error' };
    return { fase: 'listo', relic: (await res.json()) as Relic };
  } catch {
    return { fase: 'error' };
  }
}

export function FichaReliquia() {
  const { id = '' } = useParams();
  const [estado, setEstado] = useState<EstadoFicha>({ fase: 'cargando' });

  useEffect(() => {
    let vigente = true;
    setEstado({ fase: 'cargando' });
    pedirReliquia(id).then((nuevo) => {
      if (vigente) setEstado(nuevo);
    });
    return () => {
      vigente = false;
    };
  }, [id]);

  const envoltura = 'mx-auto max-w-6xl px-4 pt-12 sm:px-6';
  if (estado.fase === 'cargando') return <p className={`${envoltura} voz-terminal text-hueso/70`}>Cargando…</p>;
  if (estado.fase === 'no-encontrada') return <h1 className={`${envoltura} text-4xl`}>Reliquia no encontrada</h1>;
  if (estado.fase === 'error')
    return (
      <p role="alert" className={`${envoltura} voz-terminal text-sangre`}>
        No se pudo cargar la reliquia.
      </p>
    );

  const { relic } = estado;
  return (
    <>
      <article className={`${envoltura} grid gap-10 md:grid-cols-2`}>
        <div className="aspect-square overflow-hidden rounded border border-hueso/10 bg-tinta">
          {relic.image_url && <img src={relic.image_url} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="space-y-5 md:pt-4">
          <Link to="/catalogo" className="voz-terminal text-sm text-espectro underline-offset-4 hover:underline">
            Volver al catálogo
          </Link>
          <h1 className="text-4xl sm:text-5xl">{relic.name}</h1>
          <p className="max-w-[60ch] text-lg text-hueso/85">{relic.description}</p>
          <p className="voz-terminal text-2xl text-ambar">{formatoPrecio(relic.price_clp)}</p>
          <p className="voz-terminal text-sm text-hueso/70">Stock: {relic.stock}</p>
          <AnadirAlCarrito relic={relic} />
        </div>
      </article>
      <Resenas key={relic.id} relicId={relic.id} />
    </>
  );
}

// Lee el carrito y sube la cantidad de esta reliquia en uno. Sin sesión lleva a /entrar.
function AnadirAlCarrito({ relic }: { relic: Relic }) {
  const { usuario } = useSesion();
  const api = useApi();
  const navigate = useNavigate();
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const agotada = relic.stock <= 0;

  async function anadir() {
    if (!usuario) {
      navigate('/entrar');
      return;
    }
    setOcupado(true);
    setAviso(null);
    const carrito = await api<CarritoVista>('/cart');
    if (!carrito.ok) {
      setOcupado(false);
      setAviso({ tipo: 'error', texto: carrito.mensaje });
      return;
    }
    const actual = carrito.datos.items.find((l) => l.relic_id === relic.id)?.qty ?? 0;
    const r = await api<CarritoVista>(`/cart/items/${relic.id}`, { metodo: 'PUT', cuerpo: { qty: actual + 1 } });
    setOcupado(false);
    setAviso(r.ok ? { tipo: 'ok', texto: 'Añadida al carrito.' } : { tipo: 'error', texto: r.mensaje });
  }

  return (
    <div className="space-y-3 pt-2">
      <button type="button" onClick={anadir} disabled={agotada || ocupado} className="boton boton-primario">
        Añadir al carrito
      </button>
      {aviso && (
        <p role={aviso.tipo === 'error' ? 'alert' : 'status'} className={`voz-terminal text-sm ${aviso.tipo === 'error' ? 'text-sangre' : 'text-espectro'}`}>
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
