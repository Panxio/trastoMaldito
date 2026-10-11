import type { DatabaseSync } from 'node:sqlite';
import { flags } from '../flags.js';

// W5 — Cupón reutilizable sin límite por cliente (A06:2025 Insecure Design).
// Único lugar del proyecto con `if (flags.W5)`. El límite «un canje por cliente» es un invariante
// del servidor: se consulta antes de aplicar (carrito) y antes de cobrar (checkout), y el canje
// se registra al pagar. Carrito y checkout solo llaman a estos dos wrappers.
//
// off (corrección): canjeBloqueado consulta coupon_redemptions (PK coupon_id+user_id) y
//   registrarCanje graba el canje. El segundo intento del mismo cliente → bloqueado (409).
// on (defecto a propósito): canjeBloqueado siempre false y registrarCanje no fija el límite;
//   el mismo cupón se aplica y descuenta en pedidos sucesivos, sin tope (−50 % infinito).
export function canjeBloqueado(db: DatabaseSync, couponId: number, userId: number): boolean {
  if (flags.W5) return false;
  const fila = db
    .prepare('SELECT 1 AS x FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?')
    .get(couponId, userId);
  return fila !== undefined;
}

export function registrarCanje(db: DatabaseSync, couponId: number, userId: number): void {
  if (flags.W5) return;
  // INSERT a secas (sin OR IGNORE): un canje duplicado viola la PK y lanza. La reconfirmación
  // dentro de la transacción (orders.ts) ya evita llegar aquí dos veces; esto es el respaldo que
  // convierte en error un doble canje en lugar de tragárselo en silencio.
  db.prepare('INSERT INTO coupon_redemptions (coupon_id, user_id) VALUES (?, ?)').run(couponId, userId);
}
