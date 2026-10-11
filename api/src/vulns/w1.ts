import type { DatabaseSync } from 'node:sqlite';
import { flags } from '../flags.js';
import { COLUMNAS, searchRelics, type Relic } from '../catalog.js';

// W1 — Inyección SQL en el buscador de reliquias (A05:2025 Injection).
// Único lugar del proyecto con `if (flags.W1)`; la ruta del catálogo solo llama aquí.
//
// off (corrección): la búsqueda parametrizada de catalog.ts. El término es siempre un dato,
//   nunca SQL, así que ninguna comilla puede alterar el filtro `published = 1`.
// on (defecto a propósito): el término se concatena crudo dentro de la consulta. Una entrada
//   que cierra el patrón LIKE y añade `OR 1=1` desactiva el filtro y devuelve filas que no
//   coinciden con la búsqueda, incluidas reliquias no publicadas. Solo se afloja aquí y solo
//   con el flag encendido; el resto del proyecto nunca ve SQL sin parametrizar.
export function searchRelicsW1(db: DatabaseSync, q: string): Relic[] {
  if (!flags.W1) return searchRelics(db, q);

  const termino = q.trim();
  const sql = `SELECT ${COLUMNAS} FROM relics
    WHERE published = 1 AND (name LIKE '%${termino}%' OR description LIKE '%${termino}%')
    ORDER BY id`;
  return db.prepare(sql).all() as unknown as Relic[];
}
