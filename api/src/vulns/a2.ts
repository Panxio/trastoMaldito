import { flags } from '../flags.js';

// A2 — JWT firmado con secreto débil (API2:2023 Broken Authentication).
// Único lugar del proyecto con `if (flags.A2)`; server.ts firma y verifica con lo que devuelve
// esta función. La lección es sobre el SECRETO, no sobre el algoritmo: HS256 sigue fijo y el
// encabezado del token nunca elige cómo se verifica (así "alg":"none" no pasa, ya en jwt.ts).
//
// off (corrección): se usa el secreto fuerte de entorno (JWT_SECRET, ≥ 32 chars, o uno aleatorio
//   por arranque). Un token forjado con otro secreto falla la verificación de firma → 401.
// on (defecto a propósito): se usa un secreto PÚBLICO por defecto, embebido aquí en el repo.
//   Quien lo conoce forja un token con cualquier `sub`/`role` —incluido role:"admin"— sin
//   credenciales y entra a rutas solo-admin.
//
// SECRETO_DEBIL mide ≥ 32 chars a propósito: pasa el guard de longitud de registerAuth. La
// lección es que la longitud no salva a un secreto público/por-defecto; lo que lo rompe es que
// es CONOCIDO. Este mismo valor se replica en exploits/test_a2.py para forjar el token.
export const SECRETO_DEBIL = 'secreto-por-defecto-cambialo-en-produccion';

export function secretoEfectivo(base: string): string {
  if (!flags.A2) return base;
  return SECRETO_DEBIL;
}
