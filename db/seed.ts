import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../api/src/password.js';

const DIR_DB = dirname(fileURLToPath(import.meta.url));
const DB_PATH_POR_DEFECTO = resolve(DIR_DB, 'lab.sqlite');

interface Fixtures {
  users: {
    id: number;
    email: string;
    name: string;
    rut: string;
    commune: string;
    phone: string;
    role: string;
    password: string;
  }[];
  relics: {
    id: number;
    name: string;
    description: string;
    price_clp: number;
    stock: number;
    image_url: string;
    published: number;
  }[];
  orders: {
    id: number;
    customer_id: number;
    status: string;
    total_clp: number;
    created_at: string;
    items: { relic_id: number; qty: number; price_clp: number }[];
  }[];
  coupons: { code: string; discount_pct: number }[];
}

// Crea la BD desde cero (borra la anterior) con el esquema y los datos de fixtures.json.
export function seedDatabase(dbPath: string): void {
  const schema = readFileSync(resolve(DIR_DB, 'schema.sql'), 'utf8');
  const fixtures = JSON.parse(
    readFileSync(resolve(DIR_DB, 'fixtures.json'), 'utf8'),
  ) as Fixtures;

  for (const sufijo of ['', '-journal', '-wal', '-shm']) {
    rmSync(dbPath + sufijo, { force: true });
  }
  mkdirSync(dirname(resolve(dbPath)), { recursive: true });

  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(schema);
    db.exec('BEGIN');
    try {
      insertarFixtures(db, fixtures);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } finally {
    db.close();
  }
}

function insertarFixtures(db: DatabaseSync, fx: Fixtures): void {
  const insUsuario = db.prepare(
    'INSERT INTO users (id, email, name, rut, commune, phone, role, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const u of fx.users) {
    insUsuario.run(u.id, u.email, u.name, u.rut, u.commune, u.phone, u.role, hashPassword(u.password));
  }

  const insReliquia = db.prepare(
    'INSERT INTO relics (id, name, description, price_clp, stock, image_url, published) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  for (const r of fx.relics) {
    insReliquia.run(r.id, r.name, r.description, r.price_clp, r.stock, r.image_url, r.published);
  }

  const insCupon = db.prepare('INSERT INTO coupons (code, discount_pct) VALUES (?, ?)');
  for (const c of fx.coupons) {
    insCupon.run(c.code, c.discount_pct);
  }

  const insPedido = db.prepare(
    'INSERT INTO orders (id, customer_id, status, total_clp, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const insLinea = db.prepare(
    'INSERT INTO order_items (order_id, relic_id, qty, price_clp) VALUES (?, ?, ?, ?)',
  );
  for (const p of fx.orders) {
    insPedido.run(p.id, p.customer_id, p.status, p.total_clp, p.created_at);
    for (const l of p.items) {
      insLinea.run(p.id, l.relic_id, l.qty, l.price_clp);
    }
  }
}

// Solo siembra al ejecutarse directamente (npm run seed); importarlo no toca disco.
const ejecutadoDirecto =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (ejecutadoDirecto) {
  const dbPath = process.env.DB_PATH || DB_PATH_POR_DEFECTO;
  seedDatabase(dbPath);
  console.log(`BD ficticia sembrada en ${dbPath}`);
}
