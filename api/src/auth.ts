import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { ApiError } from './errors.js';
import { signToken, verifyToken, type AuthUser, type Role } from './jwt.js';
import { hashPassword, verifyPassword } from './vulns/w4.js';
import { auditar } from './vulns/a09.js';
import { limiteLogin } from './vulns/a07.js';
import { formatearRut, validarRut } from './rut.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
  interface FastifyInstance {
    // preHandler: exige token válido y, si se indica, ese rol. Deja {id, role} en req.user.
    requireAuth(role?: Role): (req: FastifyRequest) => Promise<void>;
  }
}

const MIN_SECRETO = 32;
// Para que un correo inexistente tarde lo mismo que una clave mala (no revela qué correos existen).
const HASH_SEÑUELO = hashPassword('señuelo-sin-cuenta');

const cuerpoRegistro = {
  type: 'object',
  additionalProperties: false,
  required: ['email', 'password', 'name', 'rut', 'commune'],
  properties: {
    email: { type: 'string', format: 'email', maxLength: 254 },
    password: { type: 'string', minLength: 10, maxLength: 128 },
    name: { type: 'string', minLength: 1, maxLength: 100 },
    rut: { type: 'string', maxLength: 14 },
    commune: { type: 'string', minLength: 1, maxLength: 60 },
    phone: { type: 'string', maxLength: 20 },
  },
} as const;

const cuerpoLogin = {
  type: 'object',
  additionalProperties: false,
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', maxLength: 254 },
    password: { type: 'string', maxLength: 128 },
  },
} as const;

interface FilaUsuario {
  id: number;
  email: string;
  name: string;
  role: Role;
  password_hash: string;
}

export function registerAuth(app: FastifyInstance, { db, secreto }: { db: DatabaseSync; secreto: string }): void {
  if (secreto.length < MIN_SECRETO) {
    throw new Error(`jwtSecret debe tener al menos ${MIN_SECRETO} caracteres`);
  }

  app.decorateRequest('user', undefined);
  app.decorate('requireAuth', (role?: Role) => async (req: FastifyRequest) => {
    const m = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
    const user = m ? verifyToken(m[1], secreto) : null;
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
    if (role && user.role !== role) throw new ApiError(403, 'FORBIDDEN', 'Permisos insuficientes');
    req.user = user;
  });

  const publico = (u: FilaUsuario) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

  app.register(
    async (api) => {
      api.post<{ Body: { email: string; password: string; name: string; rut: string; commune: string; phone?: string } }>(
        '/auth/register',
        { schema: { body: cuerpoRegistro } },
        async (req, reply) => {
          const { password, name, commune, phone } = req.body;
          const email = req.body.email.toLowerCase();
          if (!validarRut(req.body.rut)) throw new ApiError(400, 'BAD_REQUEST', 'Solicitud inválida');
          const rut = formatearRut(req.body.rut);

          const existe = db.prepare('SELECT 1 AS x FROM users WHERE email = ? OR rut = ?').get(email, rut);
          if (existe) throw new ApiError(409, 'CONFLICT', 'Ya existe una cuenta con esos datos');

          // El rol nunca viene del cliente: toda cuenta nueva es customer.
          const { lastInsertRowid } = db
            .prepare(
              "INSERT INTO users (email, name, rut, commune, phone, role, password_hash) VALUES (?, ?, ?, ?, ?, 'customer', ?)",
            )
            .run(email, name, rut, commune, phone ?? null, hashPassword(password));
          auditar(db, req, 'register', { userId: Number(lastInsertRowid), email });
          return reply.code(201).send({ user: { id: Number(lastInsertRowid), email, name, role: 'customer' } });
        },
      );

      api.post<{ Body: { email: string; password: string } }>(
        '/auth/login',
        { schema: { body: cuerpoLogin } },
        async (req) => {
          const email = req.body.email.toLowerCase();
          if (limiteLogin.bloqueado(email)) {
            throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Demasiados intentos. Prueba más tarde');
          }
          const fila = db
            .prepare('SELECT id, email, name, role, password_hash FROM users WHERE email = ?')
            .get(email) as FilaUsuario | undefined;
          const ok = verifyPassword(req.body.password, fila?.password_hash ?? HASH_SEÑUELO);
          if (!fila || !ok) {
            limiteLogin.fallo(email);
            auditar(db, req, 'login_failed', { userId: fila?.id, email });
            throw new ApiError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas');
          }
          limiteLogin.exito(email);
          auditar(db, req, 'login_ok', { userId: fila.id, email });
          return { token: signToken({ sub: fila.id, role: fila.role }, secreto), user: publico(fila) };
        },
      );
    },
    { prefix: '/api/v2' },
  );
}
