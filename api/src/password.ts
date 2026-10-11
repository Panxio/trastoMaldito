import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Formato almacenado: scrypt$<saltHex>$<hashHex>. La sal es aleatoria por clave.
const PREFIJO = 'scrypt';
const BYTES_SAL = 16;
const BYTES_CLAVE = 64;
const HEX_PAR = /^(?:[0-9a-f]{2})+$/i;

export function hashPassword(plain: string): string {
  const sal = randomBytes(BYTES_SAL);
  const hash = scryptSync(plain, sal, BYTES_CLAVE);
  return `${PREFIJO}$${sal.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  try {
    const partes = stored.split('$');
    if (partes.length !== 3 || partes[0] !== PREFIJO) return false;

    const [, salHex, hashHex] = partes;
    if (!HEX_PAR.test(salHex) || !HEX_PAR.test(hashHex)) return false;

    const esperado = Buffer.from(hashHex, 'hex');
    const calculado = scryptSync(plain, Buffer.from(salHex, 'hex'), esperado.length);
    return timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}
