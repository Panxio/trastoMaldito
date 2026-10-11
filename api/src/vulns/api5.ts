import type { FastifyInstance, FastifyRequest } from 'fastify';
import { flags } from '../flags.js';

// API5 — BFLA: autorización rota a nivel de función (API5:2023 Broken Function Level Authorization).
// Único lugar del proyecto con `if (flags.API5)`; la ruta DELETE /admin/relics/:id solo llama aquí.
//
// off (corrección): borrar inventario exige rol admin (cliente → 403), como el resto de /admin/relics*.
// on (defecto a propósito): la función solo exige sesión válida. Cualquier cliente autenticado puede
//   borrar reliquias; el rol nunca se comprueba en esta función, aunque la ruta viva bajo /admin.
export function rolParaBorrar(app: FastifyInstance): (req: FastifyRequest) => Promise<void> {
  return flags.API5 ? app.requireAuth() : app.requireAuth('admin');
}
