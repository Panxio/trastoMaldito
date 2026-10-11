import { ApiError } from '../errors.js';
import { flags } from '../flags.js';

// API4 — Consumo sin límite en el catálogo (API4:2023 Unrestricted Resource Consumption).
// Único lugar del proyecto con `if (flags.API4)`; el catálogo solo llama a `paginar`.
//
// off (corrección): `limit` va de 1 a TOPE (100) y, sin `limit`, rige TOPE. Un valor mayor → 400.
//   `offset` recorre el resto. El costo de cada petición queda acotado por el servidor.
// on (defecto a propósito): `limit` no tiene máximo y, sin él, se devuelve todo el catálogo. Quien
//   llama fija el costo de la respuesta (CPU, memoria, red) con un solo parámetro.
export const TOPE = 100;

export function paginar<T>(items: T[], { limit, offset }: { limit?: number; offset?: number }): T[] {
  if (!flags.API4) {
    if (limit !== undefined && limit > TOPE) throw new ApiError(400, 'BAD_REQUEST', 'Solicitud inválida');
    limit ??= TOPE;
  }
  const desde = offset ?? 0;
  return items.slice(desde, limit === undefined ? undefined : desde + limit);
}
