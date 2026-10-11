// Cliente HTTP compartido: prefijo /api/v2, Bearer opcional y errores {code, message} mostrados como texto.

export interface Usuario {
  id: number;
  email: string;
  name: string;
  role: string;
}

export interface LineaCarrito {
  relic_id: number;
  name: string;
  price_clp: number;
  qty: number;
  subtotal_clp: number;
}

export interface CarritoVista {
  items: LineaCarrito[];
  coupon: { code: string; discount_pct: number } | null;
  subtotal_clp: number;
  discount_clp: number;
  total_clp: number;
}

export interface LineaPedido {
  relic_id: number;
  name: string;
  qty: number;
  price_clp: number;
}

export interface Pedido {
  id: number;
  customer_id: number;
  status: 'pending' | 'paid' | 'failed';
  total_clp: number;
  coupon_code: string | null;
  created_at: string;
  items: LineaPedido[];
}

export interface RespuestaLogin {
  token: string;
  user: Usuario;
}

export interface Resena {
  id: number;
  author: string;
  body: string;
  created_at: string;
}

// Perfil propio (GET /me). `phone` puede venir null.
export interface Perfil {
  id: number;
  email: string;
  name: string;
  rut: string;
  commune: string;
  phone: string | null;
  role: string;
  store_credit: number;
}

// Reliquia tal como la ve el admin: incluye las ocultas y `published` como booleano.
export interface AdminRelic {
  id: number;
  name: string;
  description: string;
  price_clp: number;
  stock: number;
  image_url: string | null;
  published: boolean;
}

export interface OpcionesPeticion {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  cuerpo?: unknown;
  token?: string | null;
}

export type Resultado<T> = { ok: true; status: number; datos: T } | { ok: false; status: number; mensaje: string };

const MENSAJE_GENERICO = 'No se pudo completar la acción. Inténtalo otra vez.';
const SIN_CONEXION = 'No hay conexión con la tienda.';

async function leerJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function pedir<T>(ruta: string, { metodo = 'GET', cuerpo, token }: OpcionesPeticion = {}): Promise<Resultado<T>> {
  const cabeceras: Record<string, string> = {};
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (token) cabeceras.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`/api/v2${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    return { ok: false, status: 0, mensaje: SIN_CONEXION };
  }

  const datos = await leerJson(res);
  if (res.ok) return { ok: true, status: res.status, datos: datos as T };

  const mensaje = (datos as { message?: unknown } | null)?.message;
  return { ok: false, status: res.status, mensaje: typeof mensaje === 'string' ? mensaje : MENSAJE_GENERICO };
}
