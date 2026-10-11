import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { ApiError } from './errors.js';
import { canjeBloqueado } from './vulns/w5.js';

// Carrito completo tal como lo ve el cliente. Precios y nombres salen de `relics` en cada lectura.
export interface LineaCarrito {
  relic_id: number;
  name: string;
  price_clp: number;
  qty: number;
  subtotal_clp: number;
}

export interface CarritoVista {
  items: LineaCarrito[];
  coupon: { code: string; discount_pct: number } | null;
  subtotal_clp: number;
  discount_clp: number;
  total_clp: number;
}

const ID_RELIC = '^[1-9]\\d{0,9}$';

const parametrosRelic = {
  type: 'object',
  additionalProperties: false,
  required: ['relicId'],
  properties: { relicId: { type: 'string', pattern: ID_RELIC } },
} as const;

const cuerpoCantidad = {
  type: 'object',
  additionalProperties: false,
  required: ['qty'],
  properties: { qty: { type: 'integer', minimum: 1, maximum: 99 } },
} as const;

const cuerpoCupon = {
  type: 'object',
  additionalProperties: false,
  required: ['code'],
  properties: { code: { type: 'string', minLength: 1, maxLength: 40 } },
} as const;

// Un cliente = un carrito. Se crea en el primer uso.
export function asegurarCarrito(db: DatabaseSync, userId: number): number {
  db.prepare('INSERT OR IGNORE INTO carts (user_id) VALUES (?)').run(userId);
  return (db.prepare('SELECT id FROM carts WHERE user_id = ?').get(userId) as { id: number }).id;
}

export function leerCarrito(db: DatabaseSync, userId: number): CarritoVista {
  const cabecera = db.prepare('SELECT id, coupon_code FROM carts WHERE user_id = ?').get(userId) as
    | { id: number; coupon_code: string | null }
    | undefined;
  const vacio: CarritoVista = { items: [], coupon: null, subtotal_clp: 0, discount_clp: 0, total_clp: 0 };
  if (!cabecera) return vacio;

  const items = db
    .prepare(
      `SELECT ci.relic_id, r.name, r.price_clp, ci.qty
       FROM cart_items ci JOIN relics r ON r.id = ci.relic_id
       WHERE ci.cart_id = ? ORDER BY ci.relic_id`,
    )
    .all(cabecera.id) as unknown as Array<{ relic_id: number; name: string; price_clp: number; qty: number }>;

  const lineas: LineaCarrito[] = items.map((i) => ({ ...i, subtotal_clp: i.price_clp * i.qty }));
  const subtotal = lineas.reduce((s, l) => s + l.subtotal_clp, 0);

  let coupon: CarritoVista['coupon'] = null;
  let descuento = 0;
  if (cabecera.coupon_code) {
    const c = db.prepare('SELECT code, discount_pct FROM coupons WHERE code = ?').get(cabecera.coupon_code) as
      | { code: string; discount_pct: number }
      | undefined;
    if (c) {
      coupon = { code: c.code, discount_pct: c.discount_pct };
      descuento = Math.floor((subtotal * c.discount_pct) / 100);
    }
  }
  return { items: lineas, coupon, subtotal_clp: subtotal, discount_clp: descuento, total_clp: subtotal - descuento };
}

function usuario(req: FastifyRequest): number {
  if (!req.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  return req.user.id;
}

export function registerCart(app: FastifyInstance, { db }: { db: DatabaseSync }): void {
  app.register(
    async (api) => {
      api.get('/cart', { preHandler: app.requireAuth() }, async (req) => {
        const uid = usuario(req);
        asegurarCarrito(db, uid);
        return leerCarrito(db, uid);
      });

      api.put<{ Params: { relicId: string }; Body: { qty: number } }>(
        '/cart/items/:relicId',
        { schema: { params: parametrosRelic, body: cuerpoCantidad }, preHandler: app.requireAuth() },
        async (req) => {
          const uid = usuario(req);
          const relicId = Number(req.params.relicId);
          const { qty } = req.body;

          const relic = db
            .prepare('SELECT stock, published FROM relics WHERE id = ?')
            .get(relicId) as { stock: number; published: number } | undefined;
          if (!relic || relic.published !== 1) throw new ApiError(404, 'NOT_FOUND', 'Recurso no encontrado');
          if (qty > relic.stock) throw new ApiError(409, 'INSUFFICIENT_STOCK', 'Stock insuficiente');

          const cartId = asegurarCarrito(db, uid);
          db.prepare(
            `INSERT INTO cart_items (cart_id, relic_id, qty) VALUES (?, ?, ?)
             ON CONFLICT (cart_id, relic_id) DO UPDATE SET qty = excluded.qty`,
          ).run(cartId, relicId, qty);
          return leerCarrito(db, uid);
        },
      );

      api.delete<{ Params: { relicId: string } }>(
        '/cart/items/:relicId',
        { schema: { params: parametrosRelic }, preHandler: app.requireAuth() },
        async (req) => {
          const uid = usuario(req);
          const cartId = asegurarCarrito(db, uid);
          db.prepare('DELETE FROM cart_items WHERE cart_id = ? AND relic_id = ?').run(cartId, Number(req.params.relicId));
          return leerCarrito(db, uid);
        },
      );

      api.post<{ Body: { code: string } }>(
        '/cart/coupon',
        { schema: { body: cuerpoCupon }, preHandler: app.requireAuth() },
        async (req) => {
          const uid = usuario(req);
          const codigo = req.body.code.trim().toUpperCase();
          if (codigo === '') throw new ApiError(400, 'BAD_REQUEST', 'Solicitud inválida');

          const cupon = db.prepare('SELECT id, code FROM coupons WHERE code = ?').get(codigo) as
            | { id: number; code: string }
            | undefined;
          if (!cupon) throw new ApiError(404, 'COUPON_INVALID', 'Cupón inválido');

          // W5: el límite por cliente se consulta antes de aplicar (único wrapper, vulns/w5.ts).
          if (canjeBloqueado(db, cupon.id, uid)) throw new ApiError(409, 'COUPON_ALREADY_USED', 'Ya canjeaste este cupón');

          const cartId = asegurarCarrito(db, uid);
          db.prepare('UPDATE carts SET coupon_code = ? WHERE id = ?').run(cupon.code, cartId);
          return leerCarrito(db, uid);
        },
      );

      api.delete('/cart/coupon', { preHandler: app.requireAuth() }, async (req) => {
        const uid = usuario(req);
        const cartId = asegurarCarrito(db, uid);
        db.prepare('UPDATE carts SET coupon_code = NULL WHERE id = ?').run(cartId);
        return leerCarrito(db, uid);
      });
    },
    { prefix: '/api/v2' },
  );
}
