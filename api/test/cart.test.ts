import { describe, expect, it } from 'vitest';
import { BAD_REQUEST, NOT_FOUND, crearEntorno } from './helpers.js';

const VACIO = { items: [], coupon: null, subtotal_clp: 0, discount_clp: 0, total_clp: 0 };
const CLAVES_ITEM = ['relic_id', 'name', 'price_clp', 'qty', 'subtotal_clp'];

describe('carrito y cupón (M4 limpio)', () => {
  const e = crearEntorno('cart');
  const item = (id: number | string) => `/api/v2/cart/items/${id}`;
  const poner = (token: string, id: number | string, qty: unknown) => e.pedir('PUT', item(id), token, { qty });

  describe('autenticación', () => {
    it.each([
      ['GET', '/api/v2/cart', undefined],
      ['PUT', '/api/v2/cart/items/1', { qty: 1 }],
      ['DELETE', '/api/v2/cart/items/1', undefined],
      ['POST', '/api/v2/cart/coupon', { code: 'EXORCISMO' }],
      ['DELETE', '/api/v2/cart/coupon', undefined],
    ] as const)('%s %s sin token → 401', async (metodo, url, cuerpo) => {
      const res = await e.pedir(metodo, url, undefined, cuerpo);

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ code: 'UNAUTHENTICATED', message: 'Autenticación requerida' });
    });
  });

  describe('GET /cart', () => {
    it('carrito nuevo → vacío y sin cupón', async () => {
      const res = await e.pedir('GET', '/api/v2/cart', await e.token('camila'));

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(VACIO);
    });

    it('cada cliente ve solo su carrito', async () => {
      await poner(await e.token('camila'), 3, 1);

      const res = await e.pedir('GET', '/api/v2/cart', await e.token('benjamin'));

      expect(res.json()).toEqual(VACIO);
    });
  });

  describe('PUT /cart/items/:relicId', () => {
    it('agrega la reliquia con precio y subtotal sacados de la tienda', async () => {
      const res = await poner(await e.token('camila'), 3, 2);
      const cart = res.json();

      expect(res.statusCode).toBe(200);
      expect(cart.items).toHaveLength(1);
      expect(Object.keys(cart.items[0]).sort()).toEqual([...CLAVES_ITEM].sort());
      expect(cart).toEqual({
        items: [{ relic_id: 3, name: 'Péndulo de Cerro Alegre', price_clp: 52990, qty: 2, subtotal_clp: 105980 }],
        coupon: null,
        subtotal_clp: 105980,
        discount_clp: 0,
        total_clp: 105980,
      });
    });

    it('la cantidad se REEMPLAZA, no se suma; las líneas salen por relic_id', async () => {
      const token = await e.token('camila');
      await poner(token, 5, 1);
      await poner(token, 2, 1);
      const cart = (await poner(token, 5, 4)).json();

      expect(cart.items.map((i: { relic_id: number; qty: number }) => [i.relic_id, i.qty])).toEqual([
        [2, 1],
        [5, 4],
      ]);
      expect(cart.subtotal_clp).toBe(74500 + 4 * 12500);
    });

    it('acepta exactamente el stock disponible y rechaza uno más (409), sin cambiar el carrito', async () => {
      const token = await e.token('camila');

      const ok = await poner(token, 6, 2);
      const mal = await poner(token, 6, 3);

      expect(ok.statusCode).toBe(200);
      expect(mal.statusCode).toBe(409);
      expect(mal.json().code).toBe('INSUFFICIENT_STOCK');
      expect((await e.pedir('GET', '/api/v2/cart', token)).json().items[0].qty).toBe(2);
    });

    it('el precio sigue al de la tienda', async () => {
      const token = await e.token('camila');
      await poner(token, 3, 1);
      e.db.prepare('UPDATE relics SET price_clp = 1000 WHERE id = 3').run();

      expect((await e.pedir('GET', '/api/v2/cart', token)).json().total_clp).toBe(1000);
    });

    it.each([
      ['qty 0', 0],
      ['qty negativa', -1],
      ['qty 100', 100],
      ['qty decimal', 1.5],
      ['qty en texto', '2'],
      ['qty nula', null],
    ])('%s → 400 y no escribe nada', async (_caso, qty) => {
      const res = await poner(await e.token('camila'), 3, qty);

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(BAD_REQUEST);
      expect(e.db.prepare('SELECT COUNT(*) AS n FROM cart_items').get()).toEqual({ n: 0 });
    });

    it('campo de más en el cuerpo → 400', async () => {
      const res = await e.pedir('PUT', item(3), await e.token('camila'), { qty: 1, price_clp: 1 });

      expect(res.statusCode).toBe(400);
    });

    it.each([
      ['inexistente', 999],
      ['no publicada', 7],
    ])('reliquia %s → 404', async (_caso, id) => {
      const res = await poner(await e.token('camila'), id, 1);

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual(NOT_FOUND);
    });

    it('id mal formado → 400', async () => {
      expect((await poner(await e.token('camila'), 'abc', 1)).statusCode).toBe(400);
    });
  });

  describe('DELETE /cart/items/:relicId', () => {
    it('quita la línea y devuelve el carrito', async () => {
      const token = await e.token('camila');
      await poner(token, 3, 1);
      await poner(token, 5, 1);

      const res = await e.pedir('DELETE', item(3), token);

      expect(res.statusCode).toBe(200);
      expect(res.json().items.map((i: { relic_id: number }) => i.relic_id)).toEqual([5]);
    });

    it('quitar algo que no está es idempotente (200)', async () => {
      const res = await e.pedir('DELETE', item(3), await e.token('camila'));

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(VACIO);
    });

    it('no toca el carrito de otro cliente', async () => {
      await poner(await e.token('benjamin'), 3, 1);

      await e.pedir('DELETE', item(3), await e.token('camila'));

      expect((await e.pedir('GET', '/api/v2/cart', await e.token('benjamin'))).json().items).toHaveLength(1);
    });
  });

  describe('cupón', () => {
    const aplicar = (token: string, code: unknown) => e.pedir('POST', '/api/v2/cart/coupon', token, { code });
    const redimir = (userId: number) =>
      e.db.prepare("INSERT INTO coupon_redemptions (coupon_id, user_id) SELECT id, ? FROM coupons WHERE code = 'EXORCISMO'").run(userId);

    it('EXORCISMO descuenta 50 % del subtotal', async () => {
      const token = await e.token('camila');
      await poner(token, 1, 1);

      const res = await aplicar(token, 'EXORCISMO');

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        coupon: { code: 'EXORCISMO', discount_pct: 50 },
        subtotal_clp: 189990,
        discount_clp: 94995,
        total_clp: 94995,
      });
      expect(e.db.prepare('SELECT coupon_code FROM carts WHERE user_id = 2').get()).toEqual({ coupon_code: 'EXORCISMO' });
    });

    it('el descuento se redondea hacia abajo', async () => {
      const token = await e.token('camila');
      e.db.prepare('UPDATE relics SET price_clp = 12501 WHERE id = 5').run();
      await poner(token, 5, 1);

      const cart = (await aplicar(token, 'EXORCISMO')).json();

      expect(cart).toMatchObject({ subtotal_clp: 12501, discount_clp: 6250, total_clp: 6251 });
    });

    it('el código se normaliza (recorte y mayúsculas)', async () => {
      const res = await aplicar(await e.token('camila'), '  exorcismo ');

      expect(res.statusCode).toBe(200);
      expect(res.json().coupon.code).toBe('EXORCISMO');
    });

    it('el descuento sigue a los cambios del carrito', async () => {
      const token = await e.token('camila');
      await aplicar(token, 'EXORCISMO');

      const cart = (await poner(token, 3, 2)).json();

      expect(cart).toMatchObject({ subtotal_clp: 105980, discount_clp: 52990, total_clp: 52990 });
    });

    it('cupón inexistente → 404 COUPON_INVALID', async () => {
      const res = await aplicar(await e.token('camila'), 'NOEXISTE');

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('COUPON_INVALID');
      expect(e.db.prepare('SELECT COUNT(*) AS n FROM carts WHERE coupon_code IS NOT NULL').get()).toEqual({ n: 0 });
    });

    it('un cliente que ya canjeó el cupón no puede aplicarlo otra vez → 409 COUPON_ALREADY_USED', async () => {
      redimir(2);
      const token = await e.token('camila');

      const res = await aplicar(token, 'EXORCISMO');

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('COUPON_ALREADY_USED');
      expect((await e.pedir('GET', '/api/v2/cart', token)).json().coupon).toBeNull();
    });

    it('el canje de otro cliente no bloquea al resto', async () => {
      redimir(3);

      const res = await aplicar(await e.token('camila'), 'EXORCISMO');

      expect(res.statusCode).toBe(200);
    });

    it('aplicar el cupón no lo canjea (el canje ocurre al pagar)', async () => {
      await aplicar(await e.token('camila'), 'EXORCISMO');

      expect(e.db.prepare('SELECT COUNT(*) AS n FROM coupon_redemptions').get()).toEqual({ n: 0 });
    });

    it('DELETE /cart/coupon lo quita', async () => {
      const token = await e.token('camila');
      await poner(token, 1, 1);
      await aplicar(token, 'EXORCISMO');

      const res = await e.pedir('DELETE', '/api/v2/cart/coupon', token);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ coupon: null, discount_clp: 0, total_clp: 189990 });
    });

    it.each([
      ['código vacío', { code: '' }],
      ['código largo', { code: 'A'.repeat(41) }],
      ['sin código', {}],
      ['código numérico', { code: 5 }],
      ['campo de más', { code: 'EXORCISMO', discount_pct: 100 }],
    ])('%s → 400', async (_caso, cuerpo) => {
      const res = await e.pedir('POST', '/api/v2/cart/coupon', await e.token('camila'), cuerpo);

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(BAD_REQUEST);
    });
  });
});
