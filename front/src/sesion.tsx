import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { pedir, type OpcionesPeticion, type Resultado, type Usuario } from './api';

const CLAVE = 'trasto_sesion';

interface Sesion {
  token: string;
  usuario: Usuario;
}

interface ValorSesion {
  usuario: Usuario | null;
  token: string | null;
  entrar: (token: string, usuario: Usuario) => void;
  salir: () => void;
}

// localStorage puede fallar (modo privado, datos bloqueados): la sesión sigue en memoria.
function leerSesion(): Sesion | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const s = JSON.parse(crudo) as Partial<Sesion>;
    if (typeof s.token === 'string' && s.usuario && typeof s.usuario === 'object') return { token: s.token, usuario: s.usuario };
    return null;
  } catch {
    return null;
  }
}

function guardarSesion(s: Sesion | null): void {
  try {
    if (s) localStorage.setItem(CLAVE, JSON.stringify(s));
    else localStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento la sesión dura lo que la pestaña.
  }
}

const Contexto = createContext<ValorSesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(leerSesion);

  const entrar = useCallback((token: string, usuario: Usuario) => {
    const nueva = { token, usuario };
    guardarSesion(nueva);
    setSesion(nueva);
  }, []);

  const salir = useCallback(() => {
    guardarSesion(null);
    setSesion(null);
  }, []);

  const valor = useMemo<ValorSesion>(
    () => ({ usuario: sesion?.usuario ?? null, token: sesion?.token ?? null, entrar, salir }),
    [sesion, entrar, salir],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): ValorSesion {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useSesion debe usarse dentro de ProveedorSesion');
  return valor;
}

// Llamadas autenticadas: envían el token y, ante un 401, cierran la sesión.
export function useApi() {
  const { token, salir } = useSesion();
  return useCallback(
    async <T,>(ruta: string, opciones: Omit<OpcionesPeticion, 'token'> = {}): Promise<Resultado<T>> => {
      const r = await pedir<T>(ruta, { ...opciones, token });
      if (!r.ok && r.status === 401) salir();
      return r;
    },
    [token, salir],
  );
}

// Página solo para clientes con sesión; sin ella lleva a /entrar.
export function RutaProtegida({ children }: { children: ReactNode }) {
  const { usuario } = useSesion();
  return usuario ? children : <Navigate to="/entrar" replace />;
}
