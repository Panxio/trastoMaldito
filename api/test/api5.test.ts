import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BAD_REQUEST, NOT_FOUND, crearEntorno } from './helpers.js';

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const NUEVA = { name: 'Daga de Hueso', description: 'Daga tallada en hueso.', price_clp: 45000, stock: 4 };

// Las flags quedan congeladas al arrancar y en vitest todas están en off: aquí va la versión corregida.
describe('API5 DELETE /admin/relics/:id (versión corregida)', () => {
  const e = crearEntorno('api5');
  const borrar = async (id: number | string, quien?: 'admin' | 'camila') =>
    e.pedir('DELETE', `/api/v2/admin/relics/${id}`, quien ? await e.token(quien) : undefined);
  const cuenta = (tabla: string, relic: number) =>
    (e.db.prepare(`SELECT COUNT(*) AS n FROM ${tabla} WHERE relic_id = ?`).get(relic) as { n: number }).n;

  it('sin token → 401 y cliente → 403, sin borrar nada', async () => {
    expect((await borrar(1)).statusCode).toBe(401);
    const res = await borrar(1, 'camila');
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ code: 'FORBIDDEN', message: 'Permisos insuficientes' });
    expect(e.db.prepare('SELECT COUNT(*) AS n FROM relics WHERE id = 1').get()).toEqual({ n: 1 });
  });

  it('admin borra una reliquia sin pedidos: 204, y se llevan sus reseñas y líneas de carrito', async () => {
    e.db.prepare('INSERT INTO reviews (relic_id, user_id, body) VALUES (1, 2, ?)').run('reseña de prueba');
    const res = await borrar(1, 'admin');
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect(e.db.prepare('SELECT COUNT(*) AS n FROM relics WHERE id = 1').get()).toEqual({ n: 0 });
    expect(cuenta('reviews', 1)).toBe(0);
    expect(cuenta('cart_items', 1)).toBe(0);
  });

  it('con líneas de pedido → 409 y la reliquia sigue', async () => {
    const res = await borrar(2, 'admin');
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('CONFLICT');
    expect(e.db.prepare('SELECT COUNT(*) AS n FROM relics WHERE id = 2').get()).toEqual({ n: 1 });
  });

  it('inexistente → 404 y formato inválido → 400', async () => {
    const res = await borrar(999, 'admin');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(NOT_FOUND);
    const mal = await borrar('abc', 'admin');
    expect(mal.statusCode).toBe(400);
    expect(mal.json()).toEqual(BAD_REQUEST);
  });

  it('borra también la imagen subida', async () => {
    const creada = await e.pedir('POST', '/api/v2/admin/relics', await e.token('admin'), {
      ...NUEVA,
      image: { content_type: 'image/png', data_base64: PNG_B64 },
    });
    expect(readdirSync(e.uploadDir)).toHaveLength(1);
    expect((await borrar(creada.json().id, 'admin')).statusCode).toBe(204);
    expect(readdirSync(e.uploadDir)).toEqual([]);
  });
});
