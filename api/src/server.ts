import Fastify, { type FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { registerAdmin } from './admin.js';
import { registerAuth } from './auth.js';
import { registerCart } from './cart.js';
import { registerCatalog } from './catalog.js';
import { registerProfile } from './profile.js';
import { registerErrorHandlers } from './errors.js';
import { registerOrders } from './orders.js';
import { registerReviews } from './reviews.js';
import { registerWebhooks } from './webhooks.js';
import { secretoEfectivo } from './vulns/a2.js';
import { registrarV1 } from './vulns/a4.js';
import { registerW2Config } from './vulns/w2.js';

declare module 'fastify' {
  interface FastifyInstance {
    db?: DatabaseSync;
  }
}

export interface BuildOptions {
  // Base de datos de la app, expuesta como app.db. Quien la pasa es su dueño: buildServer no la cierra.
  db?: DatabaseSync;
  // Secreto del JWT (≥ 32 caracteres). Obligatorio si hay db: sin él no hay rutas de auth.
  jwtSecret?: string;
  // Carpeta donde M7 guarda las imágenes subidas por el admin. Debe existir. Solo se usa si hay db.
  uploadDir?: string;
}

export interface StartOptions {
  port: number;
  // Ruta de la SQLite (variable DB_PATH). Debe existir: se crea con `npm run seed`.
  dbPath?: string;
  // Secreto del JWT (variable JWT_SECRET). Si falta, se genera uno aleatorio por arranque.
  jwtSecret?: string;
  // Carpeta de imágenes subidas (variable UPLOAD_DIR, la crea main.ts). Solo se usa si hay dbPath.
  uploadDir?: string;
}

// Fijo en loopback: el laboratorio nunca escucha en otra interfaz, ni por HOST.
const HOST = '127.0.0.1';

export function buildServer({ db, jwtSecret, uploadDir = './uploads' }: BuildOptions = {}): FastifyInstance {
  // Esquemas estrictos: Fastify por defecto borra en silencio los campos de más y convierte tipos
  // (p. ej. un número en texto). Aquí un campo no declarado o de otro tipo es un 400.
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });

  if (db) app.decorate('db', db);

  registerErrorHandlers(app);
  if (db) {
    if (!jwtSecret) throw new Error('buildServer con db requiere jwtSecret');
    registerAuth(app, { db, secreto: secretoEfectivo(jwtSecret) });
    registerCatalog(app, { db });
    registerProfile(app, { db });
    registerAdmin(app, { db, uploadDir });
    registerCart(app, { db });
    registerOrders(app, { db });
    registerReviews(app, { db });
    registerWebhooks(app, { db });
    registerW2Config(app);
    // Siempre se llama; monta /api/v1 solo si VULN_A4=on (versión zombie).
    registrarV1(app, { db });
  }

  app.get('/health', async () => ({ ok: true }));

  return app;
}

export async function startServer({ port, dbPath, jwtSecret, uploadDir }: StartOptions): Promise<FastifyInstance> {
  const db = dbPath ? abrirBd(dbPath) : undefined;
  const app = buildServer({ db, jwtSecret: jwtSecret ?? randomBytes(32).toString('hex'), uploadDir });

  // El servidor abrió la BD, así que la cierra al apagarse.
  if (db) app.addHook('onClose', async () => {
    if (db.isOpen) db.close();
  });

  try {
    await app.listen({ port, host: HOST });
  } catch (err) {
    await app.close();
    throw err;
  }
  return app;
}

function abrirBd(dbPath: string): DatabaseSync {
  // Sin este chequeo, DatabaseSync crearía un archivo vacío y el fallo llegaría tarde.
  if (!existsSync(dbPath)) {
    throw new Error(`La BD no existe: ${dbPath}. Ejecuta "npm run seed" antes de arrancar la API.`);
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}
