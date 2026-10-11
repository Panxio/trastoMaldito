import { describe, expect, it } from 'vitest';
import { BAD_REQUEST, NOT_FOUND, crearEntorno } from './helpers.js';

const CLAVES = ['id', 'author', 'body', 'created_at'];

describe('reseñas (M2 limpio)', () => {
  const e = crearEntorno('reviews');
  const url = (id: number | string) => `/api/v2/relics/${id}/reviews`;
  const publicar = async (quien: 'camila' | 'benjamin', id: number | string, body: unknown) =>
    e.pedir('POST', url(id), await e.token(quien), body);

  describe('GET /relics/:id/reviews', () => {
    it('es público y el seed no trae reseñas', async () => {
      const res = await e.pedir('GET', url(1));

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ items: [] });
    });

    it('lista por id ascendente, solo de esa reliquia, con el nombre del autor y sin datos internos', async () => {
      await publicar('camila', 1, { body: 'Primera' });
      await publicar('benjamin', 1, { body: 'Segunda' });
      await publicar('benjamin', 2, { body: 'Otra reliquia' });

      const { items } = (await e.pedir('GET', url(1))).json();

      expect(items.map((r: { body: string }) => r.body)).toEqual(['Primera', 'Segunda']);
      expect(items.map((r: { author: string }) => r.author)).toEqual(['Camila Soto Ibáñez', 'Benjamín Arancibia Lagos']);
      for (const r of items) expect(Object.keys(r).sort()).toEqual([...CLAVES].sort());
      expect(JSON.stringify(items)).not.toMatch(/password_hash|scrypt|@trastomaldito|rut/);
    });

    it.each([
      ['inexistente', 999],
      ['no publicada', 7],
    ])('reliquia %s → 404', async (_caso, id) => {
      const res = await e.pedir('GET', url(id));

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual(NOT_FOUND);
    });

    it.each(['abc', '0', '01', '-1', '1.5', '12345678901'])('id %s → 400', async (id) => {
      const res = await e.pedir('GET', url(id));

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(BAD_REQUEST);
    });
  });

  describe('POST /relics/:id/reviews', () => {
    it('sin token → 401 y no escribe nada', async () => {
      const res = await e.pedir('POST', url(1), undefined, { body: 'hola' });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ code: 'UNAUTHENTICATED', message: 'Autenticación requerida' });
      expect(e.db.prepare('SELECT COUNT(*) AS n FROM reviews').get()).toEqual({ n: 0 });
    });

    it('crea la reseña: 201, autor y usuario salen de la sesión', async () => {
      const res = await publicar('camila', 3, { body: 'Se movió sola 👻' });
      const r = res.json();

      expect(res.statusCode).toBe(201);
      expect(Object.keys(r).sort()).toEqual([...CLAVES].sort());
      expect(r).toMatchObject({ author: 'Camila Soto Ibáñez', body: 'Se movió sola 👻' });
      expect(e.db.prepare('SELECT relic_id, user_id, body FROM reviews WHERE id = ?').get(r.id)).toEqual({
        relic_id: 3,
        user_id: 2,
        body: 'Se movió sola 👻',
      });
    });

    it('recorta espacios de los bordes', async () => {
      expect((await publicar('camila', 1, { body: '  hola  ' })).json().body).toBe('hola');
    });

    it.each([
      ['marcado HTML', '<img src=x onerror=alert(1)>'],
      ['script', '<script>window.__w2 = 1</script>'],
      ['comilla con SQL', "'); DROP TABLE reviews; --"],
      ['emoji y combinados', '🕯️ vela 👻👻 ñandú'],
      ['saltos de línea', 'línea 1\nlínea 2'],
    ])('el texto se guarda y se devuelve literal: %s', async (_caso, texto) => {
      const res = await publicar('benjamin', 2, { body: texto });
      const lista = (await e.pedir('GET', url(2))).json().items;

      expect(res.statusCode).toBe(201);
      expect(res.json().body).toBe(texto);
      expect(lista[0].body).toBe(texto);
      expect(e.db.prepare('SELECT body FROM reviews').get()).toEqual({ body: texto });
    });

    it('acepta 2000 caracteres y rechaza 2001', async () => {
      const larga = 'ñ'.repeat(2000);

      const ok = await publicar('camila', 1, { body: larga });
      const mal = await publicar('camila', 1, { body: larga + 'ñ' });

      expect(ok.statusCode).toBe(201);
      expect(ok.json().body).toBe(larga);
      expect(mal.statusCode).toBe(400);
      expect(mal.json()).toEqual(BAD_REQUEST);
    });

    it.each([
      ['cuerpo vacío', { body: '' }],
      ['solo espacios', { body: '   ' }],
      ['sin body', {}],
      ['body numérico', { body: 5 }],
      ['campo de más', { body: 'hola', user_id: 3 }],
      ['autor en el cuerpo', { body: 'hola', author: 'Otra Persona' }],
    ])('%s → 400 y no escribe nada', async (_caso, cuerpo) => {
      const res = await publicar('camila', 1, cuerpo);

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(BAD_REQUEST);
      expect(e.db.prepare('SELECT COUNT(*) AS n FROM reviews').get()).toEqual({ n: 0 });
    });

    it.each([
      ['inexistente', 999],
      ['no publicada', 7],
    ])('reliquia %s → 404', async (_caso, id) => {
      const res = await publicar('camila', id, { body: 'hola' });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual(NOT_FOUND);
      expect(e.db.prepare('SELECT COUNT(*) AS n FROM reviews').get()).toEqual({ n: 0 });
    });

    it('id mal formado → 400', async () => {
      expect((await publicar('camila', 'abc', { body: 'hola' })).statusCode).toBe(400);
    });
  });
});
