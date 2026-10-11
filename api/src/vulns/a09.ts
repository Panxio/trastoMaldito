import type { FastifyRequest } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { flags } from '../flags.js';

// A09 — Sin registro de auditoría (A09:2025 Security Logging & Alerting Failures).
// Único lugar del proyecto con `if (flags.A09)`. Auth y checkout solo llaman a `auditar`.
//
// off (corrección): cada evento de seguridad queda en la tabla audit_log (quién, qué, cuándo, desde
//   dónde). Nunca se registran secretos: solo el evento, el id de cuenta, el email intentado y la IP.
// on (defecto a propósito): no se anota nada. Un login fallido, la fuerza bruta o un pago rechazado
//   no dejan rastro y el operador no puede detectarlos ni investigarlos.
export type EventoAuditoria = 'login_ok' | 'login_failed' | 'register' | 'checkout_paid' | 'payment_failed';

export function auditar(
  db: DatabaseSync,
  req: FastifyRequest,
  evento: EventoAuditoria,
  { userId, email }: { userId?: number; email?: string } = {},
): void {
  if (flags.A09) return;
  db.prepare('INSERT INTO audit_log (event, user_id, email, ip) VALUES (?, ?, ?, ?)').run(
    evento,
    userId ?? null,
    email ?? null,
    req.ip,
  );
}
