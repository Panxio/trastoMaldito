import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../db/seed.js';
import { verifyPassword } from '../src/password.js';
import { validarRut } from '../src/rut.js';

interface FixtureUsuario {
  id: number;
  email: string;
  rut: string;
  role: string;
  password: string;
}

interface Fixtures {
  users: FixtureUsuario[];
  relics: { id: number; published: number; image_url: string }[];
  orders: { id: number; customer_id: number; total_clp: number; items: { qty: number; price_clp: number }[] }[];
  coupons: { code: string; discount_pct: number }[];
}

const fixtures = JSON.parse(
  readFileSync(new URL('../../db/fixtures.json', import.meta.url), 'utf8'),
) as Fixtures;

describe('seedDatabase (BD ficticia)', () => {
  let dir: string;
  let dbPath: string;

  // Cada consulta abre su propia conexión y la cierra: así la re-siembra
  // puede reemplazar el archivo sin conexiones abiertas.
  function con<T>(fn: (db: DatabaseSync) => T): T {
    const db = new DatabaseSync(dbPath);
    try {
      db.exec('PRAGMA foreign_keys = ON');
      return fn(db);
    } finally {
      db.close();
    }
  }

  function contar(tabla: string): number {
    return con((db) => (db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get() as { n: number }).n);
  }

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'trastomaldito-seed-'));
    dbPath = join(dir, 'lab.sqlite');
    seedDatabase(dbPath);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('cuenta lo esperado: 3 usuarios, 7 reliquias, 2 pedidos, 4 líneas y 1 cupón', () => {
    expect(contar('users')).toBe(3);
    expect(contar('relics')).toBe(7);
    expect(contar('orders')).toBe(2);
    expect(contar('order_items')).toBe(4);
    expect(contar('coupons')).toBe(1);
  });

  it('hay 1 admin y 2 clientes; las reliquias tienen 6 publicadas y 1 no publicada', () => {
    const roles = con((db) =>
      db.prepare('SELECT role, COUNT(*) AS n FROM users GROUP BY role ORDER BY role').all(),
    );
    expect(roles).toEqual([
      { role: 'admin', n: 1 },
      { role: 'customer', n: 2 },
    ]);

    const noPublicadas = con((db) =>
      db.prepare('SELECT id FROM relics WHERE published = 0').all(),
    );
    const publicadas = con((db) =>
      db.prepare('SELECT COUNT(*) AS n FROM relics WHERE published = 1').get() as { n: number },
    );
    expect(noPublicadas).toEqual([{ id: 7 }]);
    expect(publicadas.n).toBe(6);
  });

  it('cada cliente tiene al menos un pedido y el cupón EXORCISMO es de 50 %', () => {
    const clientesConPedido = con((db) =>
      db.prepare('SELECT DISTINCT customer_id FROM orders ORDER BY customer_id').all(),
    );
    expect(clientesConPedido).toEqual([{ customer_id: 2 }, { customer_id: 3 }]);

    const cupon = con((db) =>
      db.prepare("SELECT code, discount_pct FROM coupons WHERE code = 'EXORCISMO'").get(),
    );
    expect(cupon).toEqual({ code: 'EXORCISMO', discount_pct: 50 });
  });

  it('todos los RUT de usuarios pasan validarRut (módulo 11)', () => {
    const ruts = con((db) => db.prepare('SELECT rut FROM users').all() as { rut: string }[]);

    expect(ruts).toHaveLength(3);
    for (const { rut } of ruts) {
      expect(validarRut(rut), `RUT inválido en la BD: ${rut}`).toBe(true);
    }
  });

  it('no guarda claves en claro: cada hash es scrypt$ y verifica la clave del fixture', () => {
    for (const usuario of fixtures.users) {
      const fila = con((db) =>
        db.prepare('SELECT password_hash FROM users WHERE id = ?').get(usuario.id) as {
          password_hash: string;
        },
      );
      expect(fila.password_hash.startsWith('scrypt$')).toBe(true);
      expect(verifyPassword(usuario.password, fila.password_hash)).toBe(true);
    }
  });

  it('la clave en claro no aparece en el archivo de la BD', () => {
    const contenido = readFileSync(dbPath);
    for (const usuario of fixtures.users) {
      expect(contenido.includes(Buffer.from(usuario.password))).toBe(false);
    }
  });

  it('re-sembrar da exactamente los mismos conteos y los mismos correos (determinista)', () => {
    const instantanea = () => ({
      users: contar('users'),
      relics: contar('relics'),
      orders: contar('orders'),
      order_items: contar('order_items'),
      coupons: contar('coupons'),
      emails: con((db) =>
        db.prepare('SELECT email FROM users ORDER BY id').all().map((r) => (r as { email: string }).email),
      ),
    });
    const antes = instantanea();

    seedDatabase(dbPath);

    expect(instantanea()).toEqual(antes);
  });

  it('integridad referencial: PRAGMA foreign_key_check no devuelve filas', () => {
    const filas = con((db) => db.prepare('PRAGMA foreign_key_check').all());
    expect(filas).toEqual([]);
  });

  it('el total de cada pedido cuadra con la suma de sus líneas', () => {
    for (const pedido of fixtures.orders) {
      const suma = pedido.items.reduce((acc, l) => acc + l.qty * l.price_clp, 0);
      expect(pedido.total_clp).toBe(suma);
    }
  });

  it('las imágenes son rutas relativas (sin hosts externos)', () => {
    for (const reliquia of fixtures.relics) {
      expect(reliquia.image_url).toMatch(/^\/[^/]/);
    }
  });
});
