import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { ApiError } from './errors.js';
import { buscarPedidoPropio } from './vulns/a1.js';
import { auditar } from './vulns/a09.js';
import { canjeBloqueado, registrarCanje } from './vulns/w5.js';
import { pagoAprobado } from './vulns/w6.js';

export interface LineaPedido {
  relic_id: number;
  name: string;
  qty: number;
  price_clp: number;
}

export interface PedidoVista {
  id: number;
  customer_id: number;
  status: 'pending' | 'paid' | 'failed';
  total_clp: number;
  coupon_code: string | null;
  created_at: string;
  items: LineaPedido[];
}

export interface FilaPedido {
  id: number;
  customer_id: number;
  status: 'pending' | 'paid' | 'failed';
  total_clp: number;
  coupon_code: string | null;
  created_at: string;
}

interface FilaLineaCarrito {
  relic_id: number;
  qty: number;
  name: string;
  price_clp: number;
  stock: number;
  published: number;
}

// Error interno: el UPDATE de stock no encontró stock suficiente dentro de la transacción.
class StockAgotado extends Error {}

// Error interno: al reconfirmar el límite del cupón DENTRO de la transacción, ya estaba canjeado.
// Cierra la carrera TOCTOU: dos checkouts concurrentes pasan el chequeo previo al `await` del
// cobro, pero el segundo —serializado por BEGIN IMMEDIATE— ve el canje del primero aquí.
class CuponYaUsado extends Error {}

const cuerpoCheckout = {
  type: 'object',
  additionalProperties: false,
  required: ['card_number'],
  properties: { card_number: { type: 'string', pattern: '^\\d{16}$' } },
} as const;

const parametrosPedido = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: { type: 'string', pattern: '^[1-9]\\d{0,9}$' } },
} as const;

function usuario(req: FastifyRequest): number {
  if (!req.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  return req.user.id;
}

// Adjunta las líneas con el precio de la compra (order_items), no el vigente.
function cargarPedido(db: DatabaseSync, fila: FilaPedido): PedidoVista {
  const items = db
    .prepare(
      `SELECT oi.relic_id, r.name, oi.qty, oi.price_clp
       FROM order_items oi JOIN relics r ON r.id = oi.relic_id
       WHERE oi.order_id = ? ORDER BY oi.relic_id`,
    )
    .all(fila.id) as unknown as LineaPedido[];
  return { ...fila, items };
}

function marcarFallido(db: DatabaseSync, pedidoId: number): void {
  db.prepare("UPDATE orders SET status = 'failed' WHERE id = ?").run(pedidoId);
}

export function registerOrders(app: FastifyInstance, { db }: { db: DatabaseSync }): void {
  app.register(
    async (api) => {
      api.post<{ Body: { card_number: string } }>(
        '/checkout',
        { schema: { body: cuerpoCheckout }, preHandler: app.requireAuth() },
        async (req, reply) => {
          const uid = usuario(req);

          const carrito = db.prepare('SELECT id, coupon_code FROM carts WHERE user_id = ?').get(uid) as
            | { id: number; coupon_code: string | null }
            | undefined;
          const lineas = carrito
            ? (db
                .prepare(
                  `SELECT ci.relic_id, ci.qty, r.name, r.price_clp, r.stock, r.published
                   FROM cart_items ci JOIN relics r ON r.id = ci.relic_id
                   WHERE ci.cart_id = ? ORDER BY ci.relic_id`,
                )
                .all(carrito.id) as unknown as FilaLineaCarrito[])
            : [];
          if (!carrito || lineas.length === 0) throw new ApiError(400, 'EMPTY_CART', 'El carrito está vacío');

          for (const l of lineas) {
            if (l.published !== 1) throw new ApiError(409, 'ITEM_UNAVAILABLE', 'Una reliquia del carrito ya no está disponible');
            if (l.qty > l.stock) throw new ApiError(409, 'INSUFFICIENT_STOCK', 'Stock insuficiente');
          }

          let cupon: { id: number; code: string; discount_pct: number } | null = null;
          if (carrito.coupon_code) {
            cupon = db
              .prepare('SELECT id, code, discount_pct FROM coupons WHERE code = ?')
              .get(carrito.coupon_code) as { id: number; code: string; discount_pct: number };
            // W5: el límite por cliente se consulta antes de cobrar (único wrapper, vulns/w5.ts).
            if (canjeBloqueado(db, cupon.id, uid)) throw new ApiError(409, 'COUPON_ALREADY_USED', 'Ya canjeaste este cupón');
          }

          const subtotal = lineas.reduce((s, l) => s + l.price_clp * l.qty, 0);
          const descuento = cupon ? Math.floor((subtotal * cupon.discount_pct) / 100) : 0;
          const total = subtotal - descuento;

          const { lastInsertRowid } = db
            .prepare("INSERT INTO orders (customer_id, status, total_clp, coupon_code) VALUES (?, 'pending', ?, ?)")
            .run(uid, total, cupon ? cupon.code : null);
          const pedidoId = Number(lastInsertRowid);
          for (const l of lineas) {
            db.prepare('INSERT INTO order_items (order_id, relic_id, qty, price_clp) VALUES (?, ?, ?, ?)').run(
              pedidoId,
              l.relic_id,
              l.qty,
              l.price_clp,
            );
          }

          // W6: el cobro pasa por pagoAprobado (único wrapper, vulns/w6.ts). Un pago no aprobado
          // deja el pedido failed; stock, canje y carrito no se tocan.
          if (!(await pagoAprobado(req.body.card_number, total))) {
            marcarFallido(db, pedidoId);
            auditar(db, req, 'payment_failed', { userId: uid });
            throw new ApiError(402, 'PAYMENT_FAILED', 'El pago fue rechazado');
          }

          try {
            db.exec('BEGIN IMMEDIATE');
            // W5: reconfirmar el límite ya con el lock de escritura tomado. El chequeo previo
            // (antes del await del cobro) no basta contra la carrera; este sí, porque BEGIN
            // IMMEDIATE serializa y el bloque no tiene awaits. En `on`, canjeBloqueado es false.
            if (cupon && canjeBloqueado(db, cupon.id, uid)) throw new CuponYaUsado();
            for (const l of lineas) {
              const r = db
                .prepare('UPDATE relics SET stock = stock - ? WHERE id = ? AND stock >= ?')
                .run(l.qty, l.relic_id, l.qty);
              if (Number(r.changes) !== 1) throw new StockAgotado();
            }
            db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?").run(pedidoId);
            if (cupon) {
              registrarCanje(db, cupon.id, uid);
            }
            db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(carrito.id);
            db.prepare('UPDATE carts SET coupon_code = NULL WHERE id = ?').run(carrito.id);
            db.exec('COMMIT');
          } catch (err) {
            db.exec('ROLLBACK');
            // El cobro ya fue aprobado y la transacción falló: el pedido no queda paid.
            marcarFallido(db, pedidoId);
            if (err instanceof StockAgotado) throw new ApiError(409, 'INSUFFICIENT_STOCK', 'Stock insuficiente');
            if (err instanceof CuponYaUsado) throw new ApiError(409, 'COUPON_ALREADY_USED', 'Ya canjeaste este cupón');
            throw err;
          }

          auditar(db, req, 'checkout_paid', { userId: uid });
          const fila = db
            .prepare('SELECT id, customer_id, status, total_clp, coupon_code, created_at FROM orders WHERE id = ?')
            .get(pedidoId) as unknown as FilaPedido;
          return reply.code(201).send(cargarPedido(db, fila));
        },
      );

      api.get('/orders', { preHandler: app.requireAuth() }, async (req) => {
        const uid = usuario(req);
        const filas = db
          .prepare(
            'SELECT id, customer_id, status, total_clp, coupon_code, created_at FROM orders WHERE customer_id = ? ORDER BY id DESC',
          )
          .all(uid) as unknown as FilaPedido[];
        return { items: filas.map((f) => cargarPedido(db, f)) };
      });

      api.get<{ Params: { id: string } }>(
        '/orders/:id',
        { schema: { params: parametrosPedido }, preHandler: app.requireAuth() },
        async (req) => {
          const uid = usuario(req);
          const fila = buscarPedidoPropio(db, Number(req.params.id), uid);
          if (!fila) throw new ApiError(404, 'NOT_FOUND', 'Recurso no encontrado');
          return cargarPedido(db, fila);
        },
      );
    },
    { prefix: '/api/v2' },
  );
}
