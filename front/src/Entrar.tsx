import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { pedir, type RespuestaLogin } from './api';
import { useSesion } from './sesion';

export function Entrar() {
  const { entrar } = useSesion();
  const navigate = useNavigate();
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setMensaje(null);
    const r = await pedir<RespuestaLogin>('/auth/login', { metodo: 'POST', cuerpo: { email: correo, password: clave } });
    if (!r.ok) {
      setEnviando(false);
      setMensaje(r.mensaje);
      return;
    }
    entrar(r.datos.token, r.datos.user);
    navigate('/catalogo');
  }

  return (
    <section className="mx-auto max-w-md space-y-8 px-4 pt-12 sm:px-6">
      <h1 className="text-5xl">Entrar</h1>

      <form onSubmit={enviar} className="space-y-5">
        <div>
          <label htmlFor="correo" className="voz-terminal mb-1 block text-sm text-hueso/70">
            Correo
          </label>
          <input
            id="correo"
            type="email"
            autoComplete="email"
            required
            className="campo"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="clave" className="voz-terminal mb-1 block text-sm text-hueso/70">
            Contraseña
          </label>
          <input
            id="clave"
            type="password"
            autoComplete="current-password"
            required
            className="campo"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
          />
        </div>

        {mensaje && (
          <p role="alert" className="voz-terminal text-sm text-sangre">
            {mensaje}
          </p>
        )}

        <button type="submit" disabled={enviando} className="boton boton-primario">
          Entrar
        </button>
      </form>

      <p className="voz-terminal text-sm text-hueso/70">
        ¿No tienes cuenta?{' '}
        <Link to="/registro" className="text-espectro underline-offset-4 hover:underline">
          Regístrate
        </Link>
      </p>
    </section>
  );
}
