import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../db/seed.js';
import { buildServer } from '../src/server.js';

const SECRETO = 'secreto-de-prueba-largo-0123456789abcdef';
const CLAVES = ['id', 'name', 'description', 'price_clp', 'stock', 'image_url'];
const NOT_FOUND = { code: 'NOT_FOUND', message: 'Recurso no encontrado' };
const BAD_REQUEST = { code: 'BAD_REQUEST', message: 'Solicitud inválida' };

describe('catálogo (M1 limpio)', () => {
  let dir: string;
  let plantilla: string;
  let db: DatabaseSync;
  let app: ReturnType<typeof buildServer>;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'trastomaldito-catalog-'));
    plantilla = join(dir, 'plantilla.sqlite');
    seedDatabase(plantilla);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  beforeEach(() => {
    const copia = join(dir, `t-${Math.random().toString(36).slice(2)}.sqlite`);
    copyFileSync(plantilla, copia);
    db = new DatabaseSync(copia);
    db.exec('PRAGMA foreign_keys = ON');
    app = buildServer({ db, jwtSecret: SECRETO });
  });
  afterEach(async () => {
    await app.close();
    db.close();
  });

  const get = (url: string) => app.inject({ method: 'GET', url });
  const buscar = async (q: string) => {
    const res = await get(`/api/v2/relics?q=${encodeURIComponent(q)}`);
    return { res, ids: (res.json().items ?? []).map((r: { id: number }) => r.id) as number[] };
  };

  describe('GET /api/v2/relics', () => {
    it('lista las 6 publicadas por id, sin la no publicada y sin campos internos', async () => {
      const res = await get('/api/v2/relics');
      const { items } = res.json();

      expect(res.statusCode).toBe(200);
      expect(items.map((r: { id: number }) => r.id)).toEqual([1, 2, 3, 4, 5, 6]);
      for (const r of items) expect(Object.keys(r).sort()).toEqual([...CLAVES].sort());
      expect(items[0]).toMatchObject({ id: 1, name: 'Espejo de la Viuda', price_clp: 189990, stock: 3 });
    });

    it('es público: no pide token', async () => {
      expect((await get('/api/v2/relics')).statusCode).toBe(200);
    });

    it.each([
      ['por nombre', 'espejo', [1]],
      ['sin distinguir mayúsculas', 'ESPEJO', [1]],
      ['por descripción', 'sebo', [5]],
      ['con tilde y eñe del nombre', 'Valparaíso', [2]],
      ['recortando espacios', '  espejo  ', [1]],
      ['vacío devuelve todo', '', [1, 2, 3, 4, 5, 6]],
      ['solo espacios devuelve todo', '   ', [1, 2, 3, 4, 5, 6]],
    ])('?q= %s', async (_caso, q, esperado) => {
      const { res, ids } = await buscar(q);

      expect(res.statusCode).toBe(200);
      expect(ids).toEqual(esperado);
    });

    it('la reliquia no publicada no aparece ni buscándola por nombre', async () => {
      expect((await buscar('tintero')).ids).toEqual([]);
    });

    it.each([
      ['% no es comodín', '%'],
      ['_ no es comodín', '_'],
      ['comilla con SQL', "'; DROP TABLE relics; --"],
      ['condición siempre cierta', "' OR '1'='1"],
      ['unión con otra tabla', "x' UNION SELECT id,email,name,rut,0,role,password_hash FROM users --"],
      ['emoji', '👻'],
      ['barra invertida', '\\'],
    ])('?q= %s → 200 sin resultados', async (_caso, q) => {
      const { res, ids } = await buscar(q);

      expect(res.statusCode).toBe(200);
      expect(ids).toEqual([]);
      expect(res.body).not.toMatch(/password_hash|scrypt|@trastomaldito/);
      expect(db.prepare('SELECT COUNT(*) AS n FROM relics').get()).toEqual({ n: 7 });
    });

    it('un emoji real en la descripción se encuentra', async () => {
      db.prepare('UPDATE relics SET description = description || ? WHERE id = 3').run(' 👻');

      expect((await buscar('👻')).ids).toEqual([3]);
    });

    it('un % literal en el texto se busca como texto', async () => {
      db.prepare('UPDATE relics SET name = ? WHERE id = 4').run('Rosario 100% auténtico');

      expect((await buscar('100%')).ids).toEqual([4]);
      expect((await buscar('%')).ids).toEqual([4]);
    });

    it.each([
      ['q de 101 caracteres', `/api/v2/relics?q=${'a'.repeat(101)}`],
      ['q repetido', '/api/v2/relics?q=a&q=b'],
      ['parámetro no declarado', '/api/v2/relics?orden=precio'],
    ])('400 con %s', async (_caso, url) => {
      const res = await get(url);

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(BAD_REQUEST);
    });

    it('acepta q de exactamente 100 caracteres', async () => {
      expect((await get(`/api/v2/relics?q=${'a'.repeat(100)}`)).statusCode).toBe(200);
    });
  });

  describe('GET /api/v2/relics/:id', () => {
    it('devuelve la reliquia con exactamente los campos públicos', async () => {
      const res = await get('/api/v2/relics/2');

      expect(res.statusCode).toBe(200);
      expect(Object.keys(res.json()).sort()).toEqual([...CLAVES].sort());
      expect(res.json()).toMatchObject({ id: 2, name: 'Caja Musical de Valparaíso', price_clp: 74500, stock: 5 });
    });

    it('404 para la no publicada y para la inexistente, con el mismo cuerpo', async () => {
      for (const id of ['7', '999']) {
        const res = await get(`/api/v2/relics/${id}`);
        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual(NOT_FOUND);
      }
    });

    it.each(['abc', '0', '-1', '1.5', '1abc', '01', '12345678901'])('400 con id "%s"', async (id) => {
      const res = await get(`/api/v2/relics/${id}`);

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(BAD_REQUEST);
    });

    it('un id con SQL es 400 y no toca la BD', async () => {
      const res = await get(`/api/v2/relics/${encodeURIComponent('1 OR 1=1')}`);

      expect(res.statusCode).toBe(400);
      expect(db.prepare('SELECT COUNT(*) AS n FROM relics').get()).toEqual({ n: 7 });
    });
  });
});
