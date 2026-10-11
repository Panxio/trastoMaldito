import { createHmac, timingSafeEqual } from 'node:crypto';

// JWT HS256 mínimo con node:crypto (Pilar 0: sin dependencia). El algoritmo es fijo: el encabezado
// del token nunca elige cómo se verifica (así "alg":"none" no pasa).
export type Role = 'customer' | 'admin';
export interface AuthUser {
  id: number;
  role: Role;
}

const ENCABEZADO = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const ROLES: readonly string[] = ['customer', 'admin'];

function firmar(datos: string, secreto: string): string {
  return createHmac('sha256', secreto).update(datos).digest('base64url');
}

export function signToken(
  claims: { sub: number; role: Role },
  secreto: string,
  { ttlSegundos = 3600 }: { ttlSegundos?: number } = {},
): string {
  const ahora = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ ...claims, iat: ahora, exp: ahora + ttlSegundos })).toString('base64url');
  const datos = `${ENCABEZADO}.${payload}`;
  return `${datos}.${firmar(datos, secreto)}`;
}

// Devuelve el usuario del token, o null si es inválido, está mal firmado o expiró.
export function verifyToken(token: string, secreto: string): AuthUser | null {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [encabezado, payload, firma] = partes;
  if (encabezado !== ENCABEZADO) return null;

  const esperada = Buffer.from(firmar(`${encabezado}.${payload}`, secreto));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    const { sub, role, exp } = claims;
    if (typeof exp !== 'number' || exp <= Date.now() / 1000) return null;
    if (!Number.isInteger(sub) || typeof role !== 'string' || !ROLES.includes(role)) return null;
    return { id: sub as number, role: role as Role };
  } catch {
    return null;
  }
}
