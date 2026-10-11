import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { seedDatabase } from '../../db/seed.js';
import { buildServer } from '../src/server.js';

export const SECRETO = 'secreto-de-prueba-largo-0123456789abcdef';
export const NOT_FOUND = { code: 'NOT_FOUND', message: 'Recurso no encontrado' };
export const BAD_REQUEST = { code: 'BAD_REQUEST', message: 'Solicitud inválida' };

// Credenciales falsas del seed (db/fixtures.json).
export const USUARIOS = {
  admin: { id: 1, email: 'admin@trastomaldito.test', password: 'clave-falsa-lab-0' },
  camila: { id: 2, email: 'camila@trastomaldito.test', password: 'clave-falsa-lab-1' },
  benjamin: { id: 3, email: 'benjamin@trastomaldito.test', password: 'clave-falsa-lab-2' },
} as const;

export interface Entorno {
  app: ReturnType<typeof buildServer>;
  db: DatabaseSync;
  uploadDir: string;
  // Inicia sesión con el seed y devuelve el JWT.
  token(quien: keyof typeof USUARIOS): Promise<string>;
  // Petición JSON; `token` opcional. Devuelve la respuesta de inject (con .json()).
  pedir(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, token?: string, payload?: unknown): Promise<LightMyRequestResponse>;
}

// Registra los hooks de vitest: una SQLite copiada del seed y una app nueva por cada test.
export function crearEntorno(prefijo: string): Entorno {
  let dir = '';
  let plantilla = '';
  const e = {} as Entorno;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), `trastomaldito-${prefijo}-`));
    plantilla = join(dir, 'plantilla.sqlite');
    seedDatabase(plantilla);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  beforeEach(() => {
    const id = Math.random().toString(36).slice(2);
    const copia = join(dir, `t-${id}.sqlite`);
    copyFileSync(plantilla, copia);
    e.uploadDir = join(dir, `img-${id}`);
    mkdirSync(e.uploadDir);
    e.db = new DatabaseSync(copia);
    e.db.exec('PRAGMA foreign_keys = ON');
    e.app = buildServer({ db: e.db, jwtSecret: SECRETO, uploadDir: e.uploadDir });
  });
  afterEach(async () => {
    await e.app.close();
    e.db.close();
  });

  e.pedir = (method, url, token, payload) =>
    e.app.inject({
      method,
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  e.token = async (quien) => {
    const { email, password } = USUARIOS[quien];
    const res = await e.app.inject({ method: 'POST', url: '/api/v2/auth/login', payload: { email, password } });
    return res.json().token as string;
  };
  return e;
}
