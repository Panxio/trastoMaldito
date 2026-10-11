import type { FastifyError, FastifyInstance } from 'fastify';
import { cuerpoError } from './vulns/w3.js';

// Error esperado de la API: estado + código estable + mensaje fijo, aptos para mostrar al cliente.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// Respuestas de error de la versión limpia: código estable y mensaje fijo, sin traza, SQL ni rutas.
export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ code: 'NOT_FOUND', message: 'Recurso no encontrado' });
  });

  app.setErrorHandler((err: FastifyError | ApiError, req, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.status).send({ code: err.code, message: err.message });
    }
    const status = err.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      // Error inesperado 4xx (p. ej. validación de esquema): W3 decide si filtra el detalle.
      return reply.code(status).send(cuerpoError(err, 'BAD_REQUEST', 'Solicitud inválida'));
    }
    // El detalle queda en el log del servidor; en la respuesta solo si W3=on (defecto a propósito).
    req.log.error(err);
    return reply.code(500).send(cuerpoError(err, 'INTERNAL', 'Error interno'));
  });
}
