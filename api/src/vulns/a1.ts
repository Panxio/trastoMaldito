import type { DatabaseSync } from 'node:sqlite';
import { flags } from '../flags.js';
import type { FilaPedido } from '../orders.js';

const COLUMNAS = 'id, customer_id, status, total_clp, coupon_code, created_at';

// A1 — BOLA en pedidos (API1:2023 Broken Object Level Authorization).
// Único lugar del proyecto con `if (flags.A1)`; la ruta GET /orders/:id solo llama aquí.
// La sesión ya está exigida por requireAuth; lo que decide esta función es la AUTORIZACIÓN
// por objeto: si el pedido pedido pertenece a quien lo pide.
//
// off (corrección): la consulta filtra por id Y customer_id de la sesión. Un pedido ajeno
//   simplemente no aparece → la ruta responde 404 (no 403: no confirmamos que el id exista).
// on (defecto a propósito): se omite el predicado de propiedad; la consulta filtra solo por
//   id. Autenticado como un cliente, pedir el id de otro devuelve el pedido ajeno. Solo se
//   afloja aquí y solo con el flag encendido; el resto del proyecto nunca ve esta consulta.
export function buscarPedidoPropio(
  db: DatabaseSync,
  id: number,
  customerId: number,
): FilaPedido | undefined {
  if (!flags.A1) {
    return db
      .prepare(`SELECT ${COLUMNAS} FROM orders WHERE id = ? AND customer_id = ?`)
      .get(id, customerId) as unknown as FilaPedido | undefined;
  }
  return db.prepare(`SELECT ${COLUMNAS} FROM orders WHERE id = ?`).get(id) as unknown as
    | FilaPedido
    | undefined;
}
