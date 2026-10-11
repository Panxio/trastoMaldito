import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { pedir, type Resena } from './api';
import { fechaLegible } from './reliquias';
import { useApi, useSesion } from './sesion';

const MAX_TEXTO = 2000;

type Estado = { fase: 'cargando' } | { fase: 'listo'; items: Resena[]; fallo: boolean };

// Solo entra lo que tiene la forma esperada: el resto se descarta sin romper la ficha.
function aResena(valor: unknown): Resena | null {
  if (!valor || typeof valor !== 'object') return null;
  const r = valor as Record<string, unknown>;
  if (typeof r.id !== 'number' || typeof r.author !== 'string' || typeof r.body !== 'string' || typeof r.created_at !== 'string') return null;
  return { id: r.id, author: r.author, body: r.body, created_at: r.created_at };
}

// Cualquier fallo (red, estado HTTP, forma inesperada) acaba en `fallo`; nunca lanza.
async function cargarResenas(relicId: number): Promise<Estado> {
  try {
    const r = await pedir<unknown>(`/relics/${relicId}/reviews`);
    const cuerpo = r.ok ? r.datos : null;
    const lista = cuerpo && typeof cuerpo === 'object' ? (cuerpo as { items?: unknown }).items : undefined;
    if (!Array.isArray(lista)) return { fase: 'listo', items: [], fallo: true };
    const items = lista.map(aResena).filter((x): x is Resena => x !== null);
    return { fase: 'listo', items, fallo: false };
  } catch {
    return { fase: 'listo', items: [], fallo: true };
  }
}

// Sección de reseñas de una ficha. Por defecto el cuerpo se muestra como texto (escape de React).
// W2 (XSS almacenado): si la API indica rawReviews=true (VULN_W2=on) se inserta como HTML crudo.
export function Resenas({ relicId }: { relicId: number }) {
  const { usuario } = useSesion();
  const api = useApi();
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });
  const [raw, setRaw] = useState(false);
  const [borrador, setBorrador] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    setEstado({ fase: 'cargando' });
    cargarResenas(relicId).then((nuevo) => {
      if (vigente) setEstado(nuevo);
    });
    return () => {
      vigente = false;
    };
  }, [relicId]);

  // W2: el modo de render lo decide la API. Ante cualquier duda (fallo, forma inesperada),
  // se queda en texto escapado: el camino inseguro solo se toma con un rawReviews===true explícito.
  useEffect(() => {
    let vigente = true;
    pedir<{ rawReviews?: unknown }>('/config/vulns-render')
      .then((r) => {
        if (vigente && r.ok && r.datos?.rawReviews === true) setRaw(true);
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);

  async function publicar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const texto = borrador.trim();
    if (texto.length < 1 || texto.length > MAX_TEXTO) {
      setError(`La reseña debe tener entre 1 y ${MAX_TEXTO} caracteres.`);
      return;
    }
    setEnviando(true);
    setError(null);
    const r = await api<unknown>(`/relics/${relicId}/reviews`, { metodo: 'POST', cuerpo: { body: texto } });
    setEnviando(false);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    const nueva = aResena(r.datos);
    if (!nueva) {
      setError('No se pudo mostrar la reseña publicada. Recarga la página.');
      return;
    }
    setBorrador('');
    setEstado((previo) => ({
      fase: 'listo',
      items: [...(previo.fase === 'listo' ? previo.items : []), nueva],
      fallo: previo.fase === 'listo' ? previo.fallo : false,
    }));
  }

  return (
    <section aria-labelledby="resenas-titulo" className="mx-auto max-w-6xl space-y-8 px-4 pb-16 sm:px-6">
      <h2 id="resenas-titulo" className="text-3xl">
        Reseñas
      </h2>

      {usuario ? (
        <form onSubmit={publicar} className="max-w-xl space-y-3">
          <div>
            <label htmlFor="tu-resena" className="voz-terminal mb-1 block text-sm text-hueso/70">
              Tu reseña
            </label>
            <textarea
              id="tu-resena"
              rows={4}
              maxLength={MAX_TEXTO}
              value={borrador}
              disabled={enviando}
              onChange={(e) => setBorrador(e.target.value)}
              className="campo"
            />
          </div>
          <button type="submit" disabled={enviando} className="boton boton-primario">
            Publicar reseña
          </button>
          {error && (
            <p role="alert" className="voz-terminal text-sm text-sangre">
              {error}
            </p>
          )}
        </form>
      ) : (
        <p className="voz-terminal text-sm">
          <Link to="/entrar" className="text-espectro underline-offset-4 hover:underline">
            Entra para dejar una reseña
          </Link>
        </p>
      )}

      {estado.fase === 'cargando' && <p className="voz-terminal text-hueso/70">Cargando reseñas…</p>}
      {estado.fase === 'listo' && estado.fallo && <p className="voz-terminal text-sm text-sangre">No se pudieron cargar las reseñas</p>}
      {estado.fase === 'listo' && !estado.fallo && estado.items.length === 0 && (
        <p className="voz-terminal text-hueso/70">Aún no hay reseñas</p>
      )}
      {estado.fase === 'listo' && estado.items.length > 0 && (
        <ul className="divide-y divide-hueso/10 border-y border-hueso/10">
          {estado.items.map((r) => (
            <li key={r.id} className="space-y-2 py-5">
              <p className="voz-terminal flex flex-wrap items-baseline gap-x-4 text-sm">
                <span className="text-hueso">{r.author}</span>
                <span className="text-hueso/60">{fechaLegible(r.created_at)}</span>
              </p>
              {raw ? (
                <p
                  className="max-w-[70ch] whitespace-pre-line text-lg text-hueso/90"
                  dangerouslySetInnerHTML={{ __html: r.body }}
                />
              ) : (
                <p className="max-w-[70ch] whitespace-pre-line text-lg text-hueso/90">{r.body}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
