import { useEffect, useState, type FormEvent } from 'react';
import { type AdminRelic } from './api';
import { useApi, useSesion } from './sesion';

const TIPOS_IMAGEN = ['image/png', 'image/jpeg', 'image/webp'] as const;
type TipoImagen = (typeof TIPOS_IMAGEN)[number];
const MAX_IMAGEN_BYTES = 1024 * 1024;

type Aviso = { tipo: 'ok' | 'error'; texto: string };

interface CuerpoCrear {
  name: string;
  description: string;
  price_clp: number;
  stock: number;
  published: boolean;
  image?: { content_type: TipoImagen; data_base64: string };
}

const esTipoImagen = (tipo: string): tipo is TipoImagen => (TIPOS_IMAGEN as readonly string[]).includes(tipo);

// Entero mayor o igual a 0 desde un campo de texto; null si no lo es.
function aEntero(valor: string): number | null {
  const limpio = valor.trim();
  if (!/^\d+$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isSafeInteger(n) ? n : null;
}

// base64 puro: FileReader devuelve `data:<tipo>;base64,<datos>` y el prefijo no va a la API.
function leerBase64(archivo: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => {
      const texto = String(lector.result);
      resolver(texto.slice(texto.indexOf(',') + 1));
    };
    lector.onerror = () => rechazar(lector.error);
    lector.readAsDataURL(archivo);
  });
}

// La barrera real es la API (requireAuth('admin')); esto evita pintar un panel que no se puede usar.
export function Admin() {
  const { usuario } = useSesion();
  if (usuario?.role !== 'admin') {
    return (
      <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
        <h1 className="text-5xl">Administrar inventario</h1>
        <p className="voz-terminal mt-6 text-hueso/70">Solo para administradores</p>
      </section>
    );
  }
  return <PanelAdmin />;
}

function PanelAdmin() {
  const api = useApi();
  const [reliquias, setReliquias] = useState<AdminRelic[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  useEffect(() => {
    let vigente = true;
    api<{ items: AdminRelic[] }>('/admin/relics').then((r) => {
      if (!vigente) return;
      if (r.ok) setReliquias(r.datos.items);
      else setAviso({ tipo: 'error', texto: r.mensaje });
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, [api]);

  function reemplazar(actualizada: AdminRelic) {
    setReliquias((lista) => lista?.map((r) => (r.id === actualizada.id ? actualizada : r)) ?? null);
  }

  function agregar(nueva: AdminRelic) {
    setReliquias((lista) => (lista ? [...lista, nueva] : lista));
  }

  return (
    <section className="mx-auto max-w-6xl space-y-12 px-4 pt-12 sm:px-6">
      <h1 className="text-5xl">Administrar inventario</h1>

      {aviso && (
        <p role={aviso.tipo === 'error' ? 'alert' : 'status'} className={`voz-terminal text-sm ${aviso.tipo === 'error' ? 'text-sangre' : 'text-espectro'}`}>
          {aviso.texto}
        </p>
      )}

      {cargando && <p className="voz-terminal text-hueso/70">Cargando…</p>}

      {reliquias && (
        <div className="overflow-x-auto">
          <table aria-label="Inventario" className="w-full min-w-[40rem] text-left text-sm">
            <thead className="voz-terminal text-hueso/60">
              <tr className="border-b border-hueso/10">
                <th scope="col" className="py-3 pr-4 font-normal">
                  Nombre
                </th>
                <th scope="col" className="py-3 pr-4 font-normal">
                  Precio
                </th>
                <th scope="col" className="py-3 pr-4 font-normal">
                  Existencias
                </th>
                <th scope="col" className="py-3 pr-4 font-normal">
                  Estado
                </th>
                <th scope="col" className="py-3 font-normal">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {reliquias.map((r) => (
                <FilaReliquia key={r.id} relic={r} onCambio={reemplazar} onAviso={setAviso} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FormularioCrear onCreada={agregar} onAviso={setAviso} />
    </section>
  );
}

function FilaReliquia({ relic, onCambio, onAviso }: { relic: AdminRelic; onCambio: (r: AdminRelic) => void; onAviso: (a: Aviso) => void }) {
  const api = useApi();
  const [precio, setPrecio] = useState(String(relic.price_clp));
  const [existencias, setExistencias] = useState(String(relic.stock));
  const [ocupada, setOcupada] = useState(false);

  async function enviar(cuerpo: Record<string, number | boolean>, exito: string) {
    setOcupada(true);
    const r = await api<AdminRelic>(`/admin/relics/${relic.id}`, { metodo: 'PATCH', cuerpo });
    setOcupada(false);
    if (!r.ok) {
      onAviso({ tipo: 'error', texto: r.mensaje });
      return;
    }
    onCambio(r.datos);
    setPrecio(String(r.datos.price_clp));
    setExistencias(String(r.datos.stock));
    onAviso({ tipo: 'ok', texto: exito });
  }

  function guardar() {
    const price = aEntero(precio);
    const stock = aEntero(existencias);
    if (price === null || stock === null) {
      onAviso({ tipo: 'error', texto: 'Precio y existencias deben ser enteros de 0 o más.' });
      return;
    }
    enviar({ price_clp: price, stock }, 'Cambios guardados.');
  }

  function cambiarPublicada() {
    enviar({ published: !relic.published }, relic.published ? 'Reliquia oculta.' : 'Reliquia publicada.');
  }

  return (
    <tr className="border-b border-hueso/10 align-top">
      <th scope="row" className="py-4 pr-4 text-left font-normal text-hueso">
        {relic.name}
      </th>
      <td className="py-4 pr-4">
        <input
          aria-label="Precio"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={precio}
          disabled={ocupada}
          onChange={(e) => setPrecio(e.target.value)}
          className="campo w-32"
        />
      </td>
      <td className="py-4 pr-4">
        <input
          aria-label="Existencias"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={existencias}
          disabled={ocupada}
          onChange={(e) => setExistencias(e.target.value)}
          className="campo w-24"
        />
      </td>
      <td className="voz-terminal py-4 pr-4 text-hueso/80">{relic.published ? 'Publicada' : 'Oculta'}</td>
      <td className="py-4">
        <div className="voz-terminal flex flex-wrap gap-3 text-sm">
          <button type="button" disabled={ocupada} onClick={guardar} className="boton boton-contorno">
            Guardar
          </button>
          <button type="button" disabled={ocupada} onClick={cambiarPublicada} className="boton boton-contorno">
            {relic.published ? 'Ocultar' : 'Publicar'}
          </button>
        </div>
      </td>
    </tr>
  );
}

function FormularioCrear({ onCreada, onAviso }: { onCreada: (r: AdminRelic) => void; onAviso: (a: Aviso) => void }) {
  const api = useApi();
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [precio, setPrecio] = useState('');
  const [existencias, setExistencias] = useState('');
  const [publicada, setPublicada] = useState(true);
  const [archivo, setArchivo] = useState<File | null>(null);
  // Cambiar la clave del input de archivo lo vacía tras crear.
  const [versionArchivo, setVersionArchivo] = useState(0);
  const [enviando, setEnviando] = useState(false);

  async function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nombreLimpio = nombre.trim();
    const descripcionLimpia = descripcion.trim();
    const price = aEntero(precio);
    const stock = aEntero(existencias);
    if (!nombreLimpio || nombreLimpio.length > 100 || !descripcionLimpia || descripcionLimpia.length > 1000 || price === null || stock === null) {
      onAviso({ tipo: 'error', texto: 'Revisa el formulario: nombre (1 a 100), descripción (1 a 1000), y precio y existencias como enteros de 0 o más.' });
      return;
    }
    const tipoImagen = archivo && esTipoImagen(archivo.type) ? archivo.type : null;
    if (archivo && (!tipoImagen || archivo.size > MAX_IMAGEN_BYTES)) {
      onAviso({ tipo: 'error', texto: 'La imagen debe ser PNG, JPEG o WEBP, de hasta 1 MiB.' });
      return;
    }

    const cuerpo: CuerpoCrear = { name: nombreLimpio, description: descripcionLimpia, price_clp: price, stock, published: publicada };
    setEnviando(true);
    if (archivo && tipoImagen) {
      try {
        cuerpo.image = { content_type: tipoImagen, data_base64: await leerBase64(archivo) };
      } catch {
        setEnviando(false);
        onAviso({ tipo: 'error', texto: 'No se pudo leer la imagen. Prueba con otro archivo.' });
        return;
      }
    }

    const r = await api<AdminRelic>('/admin/relics', { metodo: 'POST', cuerpo });
    setEnviando(false);
    if (!r.ok) {
      onAviso({ tipo: 'error', texto: r.mensaje });
      return;
    }
    onCreada(r.datos);
    setNombre('');
    setDescripcion('');
    setPrecio('');
    setExistencias('');
    setPublicada(true);
    setArchivo(null);
    setVersionArchivo((v) => v + 1);
    onAviso({ tipo: 'ok', texto: 'Reliquia creada.' });
  }

  return (
    <form onSubmit={crear} aria-labelledby="nueva-reliquia-titulo" className="max-w-2xl space-y-5">
      <h2 id="nueva-reliquia-titulo" className="text-3xl">
        Nueva reliquia
      </h2>

      <div>
        <label htmlFor="nueva-nombre" className="voz-terminal mb-1 block text-sm text-hueso/70">
          Nombre
        </label>
        <input id="nueva-nombre" required maxLength={100} value={nombre} onChange={(e) => setNombre(e.target.value)} className="campo" />
      </div>

      <div>
        <label htmlFor="nueva-descripcion" className="voz-terminal mb-1 block text-sm text-hueso/70">
          Descripción
        </label>
        <textarea
          id="nueva-descripcion"
          required
          maxLength={1000}
          rows={4}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="campo"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="nueva-precio" className="voz-terminal mb-1 block text-sm text-hueso/70">
            Precio (CLP)
          </label>
          <input
            id="nueva-precio"
            type="number"
            inputMode="numeric"
            required
            min={0}
            step={1}
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            className="campo"
          />
        </div>
        <div>
          <label htmlFor="nueva-existencias" className="voz-terminal mb-1 block text-sm text-hueso/70">
            Existencias
          </label>
          <input
            id="nueva-existencias"
            type="number"
            inputMode="numeric"
            required
            min={0}
            step={1}
            value={existencias}
            onChange={(e) => setExistencias(e.target.value)}
            className="campo"
          />
        </div>
      </div>

      <div>
        <label htmlFor="nueva-imagen" className="voz-terminal mb-1 block text-sm text-hueso/70">
          Imagen
        </label>
        <input
          key={versionArchivo}
          id="nueva-imagen"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          className="voz-terminal block w-full text-sm text-hueso/80"
        />
      </div>

      <label className="voz-terminal flex items-center gap-3 text-sm text-hueso/80">
        <input type="checkbox" checked={publicada} onChange={(e) => setPublicada(e.target.checked)} className="h-4 w-4 accent-ambar" />
        Publicada
      </label>

      <button type="submit" disabled={enviando} className="boton boton-primario">
        Crear reliquia
      </button>
    </form>
  );
}
