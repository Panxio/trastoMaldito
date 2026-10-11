import { flags } from '../flags.js';

// A07 — Login sin límite de intentos (A07:2025 Authentication Failures).
// Único lugar del proyecto con `if (flags.A07)`: elige entre dos implementaciones del mismo contrato.
// El login solo llama a `limiteLogin.bloqueado / fallo / exito`.
//
// off (corrección): conLimite cuenta los fallos consecutivos por email (exista o no la cuenta) y,
//   al llegar a MAX_FALLOS, `bloqueado` devuelve true durante BLOQUEO_MS (los fallos más
//   viejos que eso no cuentan), incluso con la clave correcta. Un login correcto pone el contador a cero. Estado en memoria; la tabla está acotada.
// on (defecto a propósito): sinLimite nunca bloquea; se puede probar contraseñas sin parar.
export interface LimiteLogin {
  bloqueado(email: string): boolean;
  fallo(email: string): void;
  exito(email: string): void;
}

export const MAX_FALLOS = 5;
export const BLOQUEO_MS = 15 * 60 * 1000;
const MAX_CUENTAS = 10_000;

const sinLimite: LimiteLogin = { bloqueado: () => false, fallo: () => {}, exito: () => {} };

export function crearConLimite(ahora: () => number = Date.now): LimiteLogin {
  const fallos = new Map<string, { n: number; hasta: number }>();
  return {
    bloqueado(email) {
      const f = fallos.get(email);
      return f !== undefined && f.n >= MAX_FALLOS && ahora() < f.hasta;
    },
    fallo(email) {
      const previo = fallos.get(email);
      const n = previo && ahora() < previo.hasta ? previo.n + 1 : 1; // fuera de la ventana: de cero
      fallos.delete(email); // reinserta al final: la más antigua es la primera en salir
      fallos.set(email, { n, hasta: ahora() + BLOQUEO_MS });
      if (fallos.size > MAX_CUENTAS) fallos.delete(fallos.keys().next().value as string);
    },
    exito(email) {
      fallos.delete(email);
    },
  };
}

export const limiteLogin: LimiteLogin = flags.A07 ? sinLimite : crearConLimite();
