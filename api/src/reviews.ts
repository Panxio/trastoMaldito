import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { ApiError } from './errors.js';

// Reseña pública: del autor solo sale users.name (nunca email, rut ni hash).
export interface Review {
  id: number;
  author: string;
  body: string;
  created_at: string;
}

const parametrosReliquia = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string', pattern: '^[1-9]\\d{0,9}$' },
  },
} as const;

// La longitud (1 a 2000) se valida en el handler tras recortar: el esquema mide el texto sin recortar.
const cuerpoResena = {
  type: 'object',
  additionalProperties: false,
  required: ['body'],
  properties: {
    body: { type: 'string', minLength: 1 },
  },
} as const;

// Tope de reseñas legibles en tienda: 2000 caracteres cubren un párrafo largo sin inflar la BD del lab.
const MAX_BODY = 2000;

const SELECT_REVIEW = `SELECT r.id, u.name AS author, r.body, r.created_at
  FROM reviews r JOIN users u ON u.id = r.user_id`;

function exigirReliquiaPublicada(db: DatabaseSync, id: number): void {
  const fila = db.prepare('SELECT 1 AS x FROM relics WHERE id = ? AND published = 1').get(id);
  if (!fila) throw new ApiError(404, 'NOT_FOUND', 'Recurso no encontrado');
}

export function registerReviews(app: FastifyInstance, { db }: { db: DatabaseSync }): void {
  app.register(
    async (api) => {
      api.get<{ Params: { id: string } }>(
        '/relics/:id/reviews',
        { schema: { params: parametrosReliquia } },
        async (req) => {
          const id = Number(req.params.id);
          exigirReliquiaPublicada(db, id);
          const items = db
            .prepare(`${SELECT_REVIEW} WHERE r.relic_id = ? ORDER BY r.id`)
            .all(id) as unknown as Review[];
          return { items };
        },
      );

      api.post<{ Params: { id: string }; Body: { body: string } }>(
        '/relics/:id/reviews',
        { preHandler: app.requireAuth(), schema: { params: parametrosReliquia, body: cuerpoResena } },
        async (req, reply) => {
          const id = Number(req.params.id);
          exigirReliquiaPublicada(db, id);
          const body = req.body.body.trim();
          if (body.length < 1 || body.length > MAX_BODY) {
            throw new ApiError(400, 'BAD_REQUEST', 'Solicitud inválida');
          }
          const userId = req.user?.id;
          if (userId === undefined) throw new ApiError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
          const { lastInsertRowid } = db
            .prepare('INSERT INTO reviews (relic_id, user_id, body) VALUES (?, ?, ?)')
            .run(id, userId, body);
          const review = db
            .prepare(`${SELECT_REVIEW} WHERE r.id = ?`)
            .get(Number(lastInsertRowid)) as unknown as Review;
          return reply.code(201).send(review);
        },
      );
    },
    { prefix: '/api/v2' },
  );
}
