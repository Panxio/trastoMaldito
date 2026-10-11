import { describe, expect, it } from 'vitest';
import { BAD_REQUEST, NOT_FOUND, USUARIOS, crearEntorno } from './helpers.js';

const CLAVES_PEDIDO = ['id', 'customer_id', 'status', 'total_clp', 'coupon_code', 'created_at', 'items'];
const TARJETA_OK = '4242424242424242';
const TARJETA_RECHAZADA = '4000000000000002';

describe('pago y pedidos (M5 limpio)', () => {
  const e = crearEntorno('orders');
  const pagar = (token: string, card_number: unknown = TARJETA_OK) => e.pedir('POST', '/api/v2/checkout', token, { card_number });
  // El carrito se arma directo en la BD: el árbitro de M5 no depende de que M4 funcione.
  const llenar = (userId: number, lineas: Array<[number, number]>, cupon: string | null = null) => {
    const { lastInsertRowid } = e.db.prepare('INSERT INTO carts (user_id, coupon_code) VALUES (?, ?)').run(userId, cupon);
    for (const [relicId, qty] of lineas) {
      e.db.prepare('INSERT INTO cart_items (cart_id, relic_id, qty) VALUES (?, ?, ?)').run(lastInsertRowid, relicId, qty);
    }
  };
  const stock = (id: number) => (e.db.prepare('SELECT stock FROM relics WHERE id = ?').get(id) as { stock: number }).stock;
  const pedidos = () => e.db.prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number };
  const lineasCarrito = () => (e.db.prepare('SELECT COUNT(*) AS n FROM cart_items').get() as { n: number }).n;
  const canjes = () => (e.db.prepare('SELECT COUNT(*) AS n FROM coupon_redemptions').get() as { n: number }).n;

  describe('autenticación', () => {
    it.each([
      ['POST', '/api/v2/checkout', { card_number: TARJETA_OK }],
      ['GET', '/api/v2/orders', undefined],
      ['GET', '/api/v2/orders/1', undefined],
    ] as const)('%s %s sin token → 401', async (metodo, url, cuerpo) => {
      const res = await e.pedir(metodo, url, undefined, cuerpo);

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ code: 'UNAUTHENTICATED', message: 'Autenticación requerida' });
    });
  });

  describe('POST /checkout — pago aprobado', () => {
    it('crea el pedido pagado con precios y total de la tienda, descuenta stock y vacía el carrito', async () => {
      llenar(2, [[3, 2], [5, 1]]);

      const res = await pagar(await e.token('camila'));
      const o = res.json();

      expect(res.statusCode).toBe(201);
      expect(Object.keys(o).sort()).toEqual([...CLAVES_PEDIDO].sort());
      expect(o).toMatchObject({
        id: 3,
        customer_id: 2,
        status: 'paid',
        total_clp: 2 * 52990 + 12500,
        coupon_code: null,
        items: [
          { relic_id: 3, name: 'Péndulo de Cerro Alegre', qty: 2, price_clp: 52990 },
          { relic_id: 5, name: 'Vela de Velorio Antigua', qty: 1, price_clp: 12500 },
        ],
      });
      expect(stock(3)).toBe(6);
      expect(stock(5)).toBe(19);
      expect(lineasCarrito()).toBe(0);
      expect(e.db.prepare('SELECT status, total_clp FROM orders WHERE id = 3').get()).toEqual({ status: 'paid', total_clp: 118480 });
    });

    it('con cupón: aplica el 50 %, guarda el código y canjea el cupón para ese cliente', async () => {
      llenar(2, [[1, 1]], 'EXORCISMO');

      const res = await pagar(await e.token('camila'));

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ status: 'paid', total_clp: 94995, coupon_code: 'EXORCISMO' });
      expect(e.db.prepare('SELECT user_id FROM coupon_redemptions').all()).toEqual([{ user_id: 2 }]);
    });

    it('el pedido conserva el precio de la compra aunque la tienda lo cambie después', async () => {
      llenar(2, [[3, 1]]);
      const token = await e.token('camila');
      const id = (await pagar(token)).json().id;

      e.db.prepare('UPDATE relics SET price_clp = 1 WHERE id = 3').run();

      const o = (await e.pedir('GET', `/api/v2/orders/${id}`, token)).json();
      expect(o.items[0].price_clp).toBe(52990);
      expect(o.total_clp).toBe(52990);
    });

    it('un segundo checkout con el carrito ya vacío no cobra dos veces → 400 EMPTY_CART', async () => {
      llenar(2, [[3, 1]]);
      const token = await e.token('camila');
      await pagar(token);

      const res = await pagar(token);

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('EMPTY_CART');
      expect(pedidos()).toEqual({ n: 3 });
      expect(stock(3)).toBe(7);
    });
  });

  describe('POST /checkout — rechazos antes de cobrar', () => {
    it('sin carrito → 400 EMPTY_CART y no crea pedido', async () => {
      const res = await pagar(await e.token('camila'));

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('EMPTY_CART');
      expect(pedidos()).toEqual({ n: 2 });
    });

    it('stock insuficiente al pagar → 409 INSUFFICIENT_STOCK, sin pedido ni cambios', async () => {
      llenar(2, [[6, 2]]);
      e.db.prepare('UPDATE relics SET stock = 1 WHERE id = 6').run();

      const res = await pagar(await e.token('camila'));

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('INSUFFICIENT_STOCK');
      expect(pedidos()).toEqual({ n: 2 });
      expect(stock(6)).toBe(1);
      expect(lineasCarrito()).toBe(1);
    });

    it('reliquia despublicada en el carrito → 409 ITEM_UNAVAILABLE, sin pedido', async () => {
      llenar(2, [[3, 1]]);
      e.db.prepare('UPDATE relics SET published = 0 WHERE id = 3').run();

      const res = await pagar(await e.token('camila'));

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('ITEM_UNAVAILABLE');
      expect(pedidos()).toEqual({ n: 2 });
    });

    it.each([
      ['tarjeta corta', { card_number: '4242' }],
      ['tarjeta con letras', { card_number: '4242abcd4242abcd' }],
      ['tarjeta numérica', { card_number: 4242424242424242 }],
      ['sin tarjeta', {}],
      ['campo de más', { card_number: TARJETA_OK, total_clp: 1 }],
    ])('%s → 400 y no cobra', async (_caso, cuerpo) => {
      llenar(2, [[3, 1]]);

      const res = await e.pedir('POST', '/api/v2/checkout', await e.token('camila'), cuerpo);

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(BAD_REQUEST);
      expect(pedidos()).toEqual({ n: 2 });
    });
  });

  describe('POST /checkout — pago rechazado (el pedido NO queda pagado)', () => {
    it('402 PAYMENT_FAILED, pedido failed, stock y cupón intactos, carrito conservado', async () => {
      llenar(2, [[1, 1]], 'EXORCISMO');
      const token = await e.token('camila');

      const res = await pagar(token, TARJETA_RECHAZADA);

      expect(res.statusCode).toBe(402);
      expect(res.json()).toEqual({ code: 'PAYMENT_FAILED', message: 'El pago fue rechazado' });
      expect(e.db.prepare('SELECT customer_id, status, total_clp, coupon_code FROM orders WHERE id = 3').get()).toEqual({
        customer_id: 2,
        status: 'failed',
        total_clp: 94995,
        coupon_code: 'EXORCISMO',
      });
      expect(stock(1)).toBe(3);
      expect(canjes()).toBe(0);
      expect(lineasCarrito()).toBe(1);
      expect(e.db.prepare('SELECT coupon_code FROM carts WHERE user_id = 2').get()).toEqual({ coupon_code: 'EXORCISMO' });
    });

    it('el pedido fallido se ve como failed en el listado, nunca como paid; y se puede reintentar', async () => {
      llenar(2, [[3, 1]]);
      const token = await e.token('camila');
      await pagar(token, TARJETA_RECHAZADA);

      const lista = (await e.pedir('GET', '/api/v2/orders', token)).json().items;
      expect(lista[0]).toMatchObject({ id: 3, status: 'failed' });

      const reintento = await pagar(token);
      expect(reintento.statusCode).toBe(201);
      expect(reintento.json()).toMatchObject({ id: 4, status: 'paid' });
      expect(stock(3)).toBe(7);
    });
  });

  describe('GET /orders', () => {
    it('lista solo los pedidos del cliente, el más nuevo primero', async () => {
      llenar(2, [[3, 1]]);
      const token = await e.token('camila');
      await pagar(token);

      const { items } = (await e.pedir('GET', '/api/v2/orders', token)).json();

      expect(items.map((o: { id: number }) => o.id)).toEqual([3, 1]);
      for (const o of items) {
        expect(Object.keys(o).sort()).toEqual([...CLAVES_PEDIDO].sort());
        expect(o.customer_id).toBe(USUARIOS.camila.id);
      }
    });

    it('otro cliente ve solo los suyos', async () => {
      const { items } = (await e.pedir('GET', '/api/v2/orders', await e.token('benjamin'))).json();

      expect(items.map((o: { id: number }) => o.id)).toEqual([2]);
    });

    it('un cliente sin pedidos recibe lista vacía', async () => {
      const { items } = (await e.pedir('GET', '/api/v2/orders', await e.token('admin'))).json();

      expect(items).toEqual([]);
    });
  });

  describe('GET /orders/:id', () => {
    it('el dueño ve su pedido con sus líneas por relic_id', async () => {
      const res = await e.pedir('GET', '/api/v2/orders/1', await e.token('camila'));

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        id: 1,
        customer_id: 2,
        status: 'paid',
        total_clp: 134480,
        coupon_code: null,
        created_at: expect.any(String),
        items: [
          { relic_id: 2, name: 'Caja Musical de Valparaíso', qty: 1, price_clp: 74500 },
          { relic_id: 4, name: 'Rosario de Lirios Secos', qty: 2, price_clp: 29990 },
        ],
      });
    });

    it.each([
      ['otro cliente', 'benjamin'],
      ['el admin', 'admin'],
    ] as const)('pedido ajeno (%s) → el mismo 404 que uno inexistente', async (_caso, quien) => {
      const token = await e.token(quien);

      const ajeno = await e.pedir('GET', '/api/v2/orders/1', token);
      const inexistente = await e.pedir('GET', '/api/v2/orders/999', token);

      expect(ajeno.statusCode).toBe(404);
      expect(ajeno.json()).toEqual(NOT_FOUND);
      expect(inexistente.statusCode).toBe(404);
      expect(inexistente.body).toBe(ajeno.body);
    });

    it.each(['abc', '0', '01', '-1', '1.5'])('id %s → 400', async (id) => {
      const res = await e.pedir('GET', `/api/v2/orders/${id}`, await e.token('camila'));

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(BAD_REQUEST);
    });
  });
});
