import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { pedir, type RespuestaLogin } from './api';
import { useSesion } from './sesion';

interface Campos {
  nombre: string;
  rut: string;
  comuna: string;
  telefono: string;
  correo: string;
  clave: string;
}

const VACIOS: Campos = { nombre: '', rut: '', comuna: '', telefono: '', correo: '', clave: '' };

export function Registro() {
  const { entrar } = useSesion();
  const navigate = useNavigate();
  const [campos, setCampos] = useState<Campos>(VACIOS);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cambiar = (campo: keyof Campos) => (e: { target: { value: string } }) =>
    setCampos((actual) => ({ ...actual, [campo]: e.target.value }));

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setMensaje(null);

    const cuerpo: Record<string, string> = {
      email: campos.correo,
      password: campos.clave,
      name: campos.nombre,
      rut: campos.rut,
      commune: campos.comuna,
    };
    // El teléfono es opcional: solo viaja si se escribió.
    if (campos.telefono.trim()) cuerpo.phone = campos.telefono.trim();

    const alta = await pedir('/auth/register', { metodo: 'POST', cuerpo });
    if (!alta.ok) {
      setEnviando(false);
      setMensaje(alta.mensaje);
      return;
    }

    const login = await pedir<RespuestaLogin>('/auth/login', {
      metodo: 'POST',
      cuerpo: { email: campos.correo, password: campos.clave },
    });
    if (!login.ok) {
      // La cuenta ya existe: que entre a mano.
      navigate('/entrar');
      return;
    }
    entrar(login.datos.token, login.datos.user);
    navigate('/catalogo');
  }

  return (
    <section className="mx-auto max-w-md space-y-8 px-4 pt-12 sm:px-6">
      <h1 className="text-5xl">Nueva cuenta</h1>

      <form onSubmit={enviar} className="space-y-5">
        <div>
          <label htmlFor="nombre" className="voz-terminal mb-1 block text-sm text-hueso/70">
            Nombre
          </label>
          <input id="nombre" autoComplete="name" required maxLength={100} className="campo" value={campos.nombre} onChange={cambiar('nombre')} />
        </div>

        <div>
          <label htmlFor="rut" className="voz-terminal mb-1 block text-sm text-hueso/70">
            RUT
          </label>
          <input id="rut" required maxLength={14} className="campo" value={campos.rut} onChange={cambiar('rut')} />
        </div>

        <div>
          <label htmlFor="comuna" className="voz-terminal mb-1 block text-sm text-hueso/70">
            Comuna
          </label>
          <input id="comuna" required maxLength={60} className="campo" value={campos.comuna} onChange={cambiar('comuna')} />
        </div>

        <div>
          <label htmlFor="telefono" className="voz-terminal mb-1 block text-sm text-hueso/70">
            Teléfono (opcional)
          </label>
          <input id="telefono" type="tel" autoComplete="tel" maxLength={20} className="campo" value={campos.telefono} onChange={cambiar('telefono')} />
        </div>

        <div>
          <label htmlFor="correo" className="voz-terminal mb-1 block text-sm text-hueso/70">
            Correo
          </label>
          <input id="correo" type="email" autoComplete="email" required className="campo" value={campos.correo} onChange={cambiar('correo')} />
        </div>

        <div>
          <label htmlFor="clave" className="voz-terminal mb-1 block text-sm text-hueso/70">
            Contraseña
          </label>
          <input
            id="clave"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
            aria-describedby="ayuda-clave"
            className="campo"
            value={campos.clave}
            onChange={cambiar('clave')}
          />
          <p id="ayuda-clave" className="voz-terminal mt-1 text-xs text-hueso/60">
            Mínimo 10 caracteres.
          </p>
        </div>

        {mensaje && (
          <p role="alert" className="voz-terminal text-sm text-sangre">
            {mensaje}
          </p>
        )}

        <button type="submit" disabled={enviando} className="boton boton-primario">
          Crear cuenta
        </button>
      </form>

      <p className="voz-terminal text-sm text-hueso/70">
        ¿Ya tienes cuenta?{' '}
        <Link to="/entrar" className="text-espectro underline-offset-4 hover:underline">
          Entra aquí
        </Link>
      </p>
    </section>
  );
}
