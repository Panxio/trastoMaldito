import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { ApiError } from './errors.js';
import { searchRelicsW1 } from './vulns/w1.js';
import { paginar } from './vulns/api4.js';

// Campos públicos de una reliquia. `published` nunca sale de la API.
export interface Relic {
  id: number;
  name: string;
  description: string;
  price_clp: number;
  stock: number;
  image_url: string | null;
}

export const COLUMNAS = 'id, name, description, price_clp, stock, image_url';

const consultaLista = {
  type: 'object',
  additionalProperties: false,
  properties: {
    q: { type: 'string', maxLength: 100 },
    limit: { type: 'string', pattern: '^[1-9]\\d{0,9}$' },
    offset: { type: 'string', pattern: '^(0|[1-9]\\d{0,9})$' },
  },
} as const;

const parametrosReliquia = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string', pattern: '^[1-9]\\d{0,9}$' },
  },
} as const;

// Búsqueda sin distinguir mayúsculas (ASCII, que es lo que hace lower() de SQLite) y por subcadena literal.
// instr() compara texto plano, así que % y _ no son comodines y no hace falta escapar nada.
// q vacía (tras recortar) devuelve todas las publicadas.
export function searchRelics(db: DatabaseSync, q: string): Relic[] {
  const termino = q.trim();
  return db
    .prepare(
      `SELECT ${COLUMNAS} FROM relics
       WHERE published = 1
         AND (? = '' OR instr(lower(name), lower(?)) > 0 OR instr(lower(description), lower(?)) > 0)
       ORDER BY id`,
    )
    .all(termino, termino, termino) as unknown as Relic[];
}

export function registerCatalog(app: FastifyInstance, { db }: { db: DatabaseSync }): void {
  app.register(
    async (api) => {
      api.get<{ Querystring: { q?: string; limit?: string; offset?: string } }>(
        '/relics',
        { schema: { querystring: consultaLista } },
        async (req) => ({ items: paginar(searchRelicsW1(db, req.query.q ?? ''), {
            limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
            offset: req.query.offset === undefined ? undefined : Number(req.query.offset),
          }) }),
      );

      api.get<{ Params: { id: string } }>(
        '/relics/:id',
        { schema: { params: parametrosReliquia } },
        async (req) => {
          const relic = db
            .prepare(`SELECT ${COLUMNAS} FROM relics WHERE id = ? AND published = 1`)
            .get(Number(req.params.id)) as unknown as Relic | undefined;
          if (!relic) throw new ApiError(404, 'NOT_FOUND', 'Recurso no encontrado');
          return relic;
        },
      );
    },
    { prefix: '/api/v2' },
  );
}
