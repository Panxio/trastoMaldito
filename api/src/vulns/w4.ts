import { createHash, timingSafeEqual } from 'node:crypto';
import { flags } from '../flags.js';
import { hashPassword as hashFuerte, verifyPassword as verifyFuerte } from '../password.js';

// W4 — Hash de contraseñas débil y sin sal (A04:2025 Cryptographic Failures).
// Único lugar del proyecto con `if (flags.W4)`; auth.ts solo llama a estos wrappers. El hash
// nunca sale por la API: la lección es cómo se ALMACENA la contraseña.
//
// off (corrección): scrypt con sal aleatoria por clave (scrypt$<sal>$<hash>), lento y único por
//   usuario. Es api/src/password.ts, intacto.
// on (defecto a propósito): sha256 rápido y SIN SAL (sha256$<hex>). Dos cuentas con la misma
//   clave comparten hash (rainbow tables) y, al ser rápido, la fuerza bruta masiva es barata.
//
// verify acepta AMBOS formatos sin mirar el flag: una BD sembrada con scrypt sigue verificando
// aunque W4=on, y un hash sha256$ verifica aunque W4=off. El flag solo decide cómo se GUARDA.
const PREFIJO_DEBIL = 'sha256';

function hashDebil(plain: string): string {
  return `${PREFIJO_DEBIL}$${createHash('sha256').update(plain).digest('hex')}`;
}

export function hashPassword(plain: string): string {
  if (flags.W4) return hashDebil(plain);
  return hashFuerte(plain);
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (stored.startsWith(`${PREFIJO_DEBIL}$`)) {
    const esperado = Buffer.from(hashDebil(plain));
    const recibido = Buffer.from(stored);
    return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
  }
  return verifyFuerte(plain, stored);
}
