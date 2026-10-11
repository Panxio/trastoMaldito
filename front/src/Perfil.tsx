import { useEffect, useState, type FormEvent } from 'react';
import { type Perfil as PerfilDatos } from './api';
import { formatoPrecio } from './reliquias';
import { useApi } from './sesion';

type Carga = { fase: 'cargando' } | { fase: 'error'; mensaje: string } | { fase: 'listo'; perfil: PerfilDatos };
type Campos = { name: string; commune: string; phone: string };
type Aviso = { tipo: 'ok' | 'error'; texto: string };

// El teléfono `null` de la API se muestra vacío.
const desdePerfil = (p: PerfilDatos): Campos => ({ name: p.name, commune: p.commune, phone: p.phone ?? '' });

export function Perfil() {
  const api = useApi();
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' });
  const [campos, setCampos] = useState<Campos>({ name: '', commune: '', phone: '' });
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  useEffect(() => {
    let vigente = true;
    api<PerfilDatos>('/me').then((r) => {
      if (!vigente) return;
      if (r.ok) {
        setCarga({ fase: 'listo', perfil: r.datos });
        setCampos(desdePerfil(r.datos));
      } else {
        setCarga({ fase: 'error', mensaje: r.mensaje });
      }
    });
    return () => {
      vigente = false;
    };
  }, [api]);

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGuardando(true);
    setAviso(null);
    const r = await api<PerfilDatos>('/me', {
      metodo: 'PATCH',
      cuerpo: { name: campos.name.trim(), commune: campos.commune.trim(), phone: campos.phone.trim() },
    });
    setGuardando(false);
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.mensaje });
      return;
    }
    setCarga({ fase: 'listo', perfil: r.datos });
    setCampos(desdePerfil(r.datos));
    setAviso({ tipo: 'ok', texto: 'Perfil guardado' });
  }

  const perfil = carga.fase === 'listo' ? carga.perfil : null;

  return (
    <section className="mx-auto max-w-3xl space-y-10 px-4 pt-12 sm:px-6">
      <h1 className="text-5xl">Perfil</h1>

      {carga.fase === 'cargando' && <p className="voz-terminal text-hueso/70">Cargando…</p>}
      {carga.fase === 'error' && (
        <p role="alert" className="voz-terminal text-sangre">
          {carga.mensaje}
        </p>
      )}

      {perfil && (
        <>
          <dl className="voz-terminal grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-sm">
            <dt className="text-hueso/60">Correo</dt>
            <dd>{perfil.email}</dd>
            <dt className="text-hueso/60">RUT</dt>
            <dd>{perfil.rut}</dd>
            <dt className="text-hueso/60">Crédito de tienda</dt>
            <dd className="text-ambar">{formatoPrecio(perfil.store_credit)}</dd>
          </dl>

          <form onSubmit={guardar} className="max-w-xl space-y-5">
            <div>
              <label htmlFor="perfil-nombre" className="voz-terminal mb-1 block text-sm text-hueso/70">
                Nombre
              </label>
              <input
                id="perfil-nombre"
                required
                maxLength={100}
                autoComplete="name"
                value={campos.name}
                onChange={(e) => setCampos((c) => ({ ...c, name: e.target.value }))}
                className="campo"
              />
            </div>

            <div>
              <label htmlFor="perfil-comuna" className="voz-terminal mb-1 block text-sm text-hueso/70">
                Comuna
              </label>
              <input
                id="perfil-comuna"
                required
                maxLength={60}
                autoComplete="address-level2"
                value={campos.commune}
                onChange={(e) => setCampos((c) => ({ ...c, commune: e.target.value }))}
                className="campo"
              />
            </div>

            <div>
              <label htmlFor="perfil-telefono" className="voz-terminal mb-1 block text-sm text-hueso/70">
                Teléfono
              </label>
              <input
                id="perfil-telefono"
                type="tel"
                maxLength={20}
                autoComplete="tel"
                value={campos.phone}
                onChange={(e) => setCampos((c) => ({ ...c, phone: e.target.value }))}
                className="campo"
              />
            </div>

            <button type="submit" disabled={guardando} className="boton boton-primario">
              Guardar cambios
            </button>

            {aviso && (
              <p role={aviso.tipo === 'error' ? 'alert' : 'status'} className={`voz-terminal text-sm ${aviso.tipo === 'error' ? 'text-sangre' : 'text-espectro'}`}>
                {aviso.texto}
              </p>
            )}
          </form>
        </>
      )}
    </section>
  );
}
