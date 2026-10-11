import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { ApiError } from './errors.js';
import { firmaAceptada } from './vulns/a08.js';

// Webhook de la pasarela de pago falsa: avisa los pagos diferidos de pedidos que el checkout dejó failed.
// No lleva sesión de usuario (lo llama la pasarela): la firma es su única autenticación (A08).

class StockAgotado extends Error {}

function leerAviso(cuerpo: string): { order_id: number } {
  let json: unknown;
  try {
    json = JSON.parse(cuerpo);
  } catch {
    throw new ApiError(400, 'BAD_REQUEST', 'Solicitud inválida');
  }
  const o = json as Record<string, unknown> | null;
  const claves = o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o) : [];
  const valido =
    claves.length === 2 &&
    o!.event === 'payment.approved' &&
    typeof o!.order_id === 'number' &&
    Number.isInteger(o!.order_id) &&
    o!.order_id > 0;
  if (!valido) throw new ApiError(400, 'BAD_REQUEST', 'Solicitud inválida');
  return { order_id: o!.order_id as number };
}

export function registerWebhooks(app: FastifyInstance, { db }: { db: DatabaseSync }): void {
  app.register(
    async (api) => {
      // Cuerpo crudo solo en este plugin: la firma se calcula sobre los bytes exactos que llegaron.
      api.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => done(null, body));

      api.post<{ Body: string }>('/payment', async (req, reply) => {
        const cuerpo = typeof req.body === 'string' ? req.body : '';
        const cabecera = req.headers['x-signature'];
        if (!firmaAceptada(cuerpo, typeof cabecera === 'string' ? cabecera : undefined)) {
          throw new ApiError(401, 'INVALID_SIGNATURE', 'Firma inválida');
        }
        const { order_id } = leerAviso(cuerpo);

        const pedido = db.prepare('SELECT id, status FROM orders WHERE id = ?').get(order_id) as
          | { id: number; status: 'pending' | 'paid' | 'failed' }
          | undefined;
        if (!pedido) throw new ApiError(404, 'NOT_FOUND', 'Recurso no encontrado');
        if (pedido.status === 'paid') return reply.code(200).send({ order_id, status: 'paid' });

        try {
          db.exec('BEGIN IMMEDIATE');
          const lineas = db.prepare('SELECT relic_id, qty FROM order_items WHERE order_id = ?').all(order_id) as unknown as {
            relic_id: number;
            qty: number;
          }[];
          for (const l of lineas) {
            const r = db
              .prepare('UPDATE relics SET stock = stock - ? WHERE id = ? AND stock >= ?')
              .run(l.qty, l.relic_id, l.qty);
            if (Number(r.changes) !== 1) throw new StockAgotado();
          }
          db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?").run(order_id);
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          if (err instanceof StockAgotado) throw new ApiError(409, 'INSUFFICIENT_STOCK', 'Stock insuficiente');
          throw err;
        }
        return reply.code(200).send({ order_id, status: 'paid' });
      });
    },
    { prefix: '/api/v2/webhooks' },
  );
}
