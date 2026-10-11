import { createHmac, timingSafeEqual } from 'node:crypto';
import { flags } from '../flags.js';

// A08 — Webhook de pago sin firma (A08:2025 Software or Data Integrity Failures).
// Único lugar del proyecto con `if (flags.A08)`; la ruta POST /webhooks/payment solo llama aquí.
//
// off (corrección): el aviso de la pasarela solo vale con una firma HMAC-SHA256 válida del cuerpo crudo.
// on (defecto a propósito): la firma no se comprueba; cualquiera puede avisar que un pedido «se pagó».

// Secreto compartido con la pasarela FALSA del laboratorio. Es falso a propósito y público en el repo.
export const SECRETO_PASARELA_LAB = 'secreto-falso-pasarela-lab';

// Lo que haría la pasarela: firma el cuerpo crudo con el secreto compartido.
export function firmar(cuerpo: string): string {
  return 'sha256=' + createHmac('sha256', SECRETO_PASARELA_LAB).update(cuerpo).digest('hex');
}

export function firmaAceptada(cuerpo: string, cabecera: string | undefined): boolean {
  if (flags.A08) return true;
  if (typeof cabecera !== 'string') return false;
  const esperada = Buffer.from(firmar(cuerpo));
  const recibida = Buffer.from(cabecera);
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}
