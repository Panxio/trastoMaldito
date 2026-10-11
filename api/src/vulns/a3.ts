import { flags } from '../flags.js';

// A3 — BOPLA en el perfil (API3:2023 Broken Object Property Level Authorization).
// Único lugar del proyecto con `if (flags.A3)`; la ruta PATCH /me solo llama aquí.
// Decide DOS cosas acopladas: el esquema del cuerpo y qué columnas se dejan asignar.
//
// off (corrección): esquema cerrado (`additionalProperties: false`, solo name/commune/phone)
//   y lista cerrada de columnas. Un campo extra rebota con 400; role y store_credit jamás se
//   tocan desde esta ruta.
// on (defecto a propósito): el esquema se afloja para que los campos privilegiados no reboten,
//   y el mapeo los copia al registro → mass assignment: el cliente se asciende a `admin` o se
//   regala `store_credit`. Solo se afloja aquí y solo con el flag encendido.
//
// Seguridad del lab: incluso en `on` las claves del cliente se intersectan con una LISTA FIJA
// de columnas reales (ASIGNABLES_ON); nunca se usa una clave cruda del cliente como
// identificador SQL. El defecto es BOPLA (autorización a nivel de propiedad), no inyección.

const EDITABLES = ['name', 'commune', 'phone'] as const;
// Columnas que el mapeo ingenuo de `on` deja asignar de más: las editables + las privilegiadas.
const ASIGNABLES_ON = [...EDITABLES, 'role', 'store_credit'] as const;

const ESQUEMA_ESTRICTO = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    commune: { type: 'string', minLength: 1, maxLength: 60 },
    phone: { type: 'string', minLength: 0, maxLength: 20 },
  },
} as const;

// Aflojado: acepta campos extra (role, store_credit…) sin rebotar con 400.
const ESQUEMA_ABIERTO = { type: 'object', minProperties: 1, additionalProperties: true } as const;

// El flag se congela al arrancar, así que el esquema se elige una vez, al registrar la ruta.
export const cuerpoEdicion = flags.A3 ? ESQUEMA_ABIERTO : ESQUEMA_ESTRICTO;

// Columnas a asignar presentes en el cuerpo. off: solo la lista cerrada. on: también las
// privilegiadas. El resultado solo contiene identificadores de la lista fija, nunca del cliente.
export function camposAsignables(cuerpo: Record<string, unknown>): string[] {
  const permitidos: readonly string[] = flags.A3 ? ASIGNABLES_ON : EDITABLES;
  return permitidos.filter((c) => c in cuerpo);
}
