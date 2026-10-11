import { flags } from '../flags.js';

// W3 — Errores verbosos de la API (A02:2025 Security Misconfiguration).
// Único lugar del proyecto con `if (flags.W3)`; errors.ts solo llama a este wrapper en sus
// ramas de error INESPERADO (validación 4xx y excepción 500). Los ApiError esperados ya salen
// con su código y mensaje fijos y no pasan por aquí.
//
// off (corrección): el cuerpo inesperado es genérico y estable: solo {code, message} fijos. La
//   traza y el detalle interno quedan en el log del servidor, nunca en la respuesta.
// on (defecto a propósito): el cuerpo añade el detalle interno del error: `detail` (err.message,
//   texto del framework/validación) y `stack` (err.stack, con rutas de archivos del servidor,
//   versiones y estructura). Un atacante provoca un error y lee las tripas del backend.
export interface CuerpoError {
  code: string;
  message: string;
  detail?: string;
  stack?: string;
}

export function cuerpoError(err: Error, code: string, message: string): CuerpoError {
  if (!flags.W3) return { code, message };
  return { code, message, detail: err.message, stack: err.stack };
}
