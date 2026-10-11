// Forma pública de una reliquia tal como la devuelve la API, y su acceso.
export interface Relic {
  id: number;
  name: string;
  description: string;
  price_clp: number;
  stock: number;
  image_url: string | null;
}

// Pesos chilenos con punto de miles: 189990 -> "$189.990".
export function formatoPrecio(clp: number): string {
  return `$${String(clp).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

// La API guarda la fecha en UTC con formato SQLite ("2026-10-10 10:00:00").
export function fechaLegible(texto: string): string {
  const d = new Date(`${texto.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return texto;
  return d.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' });
}

export type EstadoLista = { fase: 'cargando' } | { fase: 'error' } | { fase: 'listo'; items: Relic[] };

export async function pedirReliquias(q: string): Promise<EstadoLista> {
  const url = q ? `/api/v2/relics?q=${encodeURIComponent(q)}` : '/api/v2/relics';
  try {
    const res = await fetch(url);
    if (!res.ok) return { fase: 'error' };
    const cuerpo = (await res.json()) as { items: Relic[] };
    return { fase: 'listo', items: cuerpo.items };
  } catch {
    return { fase: 'error' };
  }
}
