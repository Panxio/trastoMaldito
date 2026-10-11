import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

type Llamada = { metodo: string; url: string; cuerpo: unknown; auth: string | null };
type Respuesta = { status?: number; cuerpo?: unknown };
type Manejador = (llamada: Llamada) => Respuesta | undefined;

const CLIENTE = { id: 7, email: 'ana@lab.test', name: 'Ana Prueba', role: 'customer' };
const ADMIN = { id: 1, email: 'admin@lab.test', name: 'Admin', role: 'admin' };
const RELIQUIA = { id: 1, name: 'Espejo de la Viuda', description: 'Marco ennegrecido.', price_clp: 189990, stock: 3, image_url: null };
const RESENA = { id: 5, author: 'Camila Soto', body: 'Llegó frío y con olor a lluvia.', created_at: '2026-10-09 12:00:00' };
const MALICIOSA = { id: 6, author: 'Intruso', body: '<img src=x onerror="window.__xss=1"><b>negrita</b>\nsegunda línea', created_at: '2026-10-09 13:00:00' };
const PERFIL = { id: 7, email: 'ana@lab.test', name: 'Ana Prueba', rut: '12.345.678-5', commune: 'Valparaíso', phone: null, role: 'customer', store_credit: 2500 };
const ADMIN_RELICS = {
  items: [
    { id: 1, name: 'Espejo de la Viuda', description: 'Marco.', price_clp: 189990, stock: 3, image_url: null, published: true },
    { id: 2, name: 'Caja Oculta', description: 'Sin publicar.', price_clp: 5000, stock: 0, image_url: null, published: false },
  ],
};

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
let llamadas: Llamada[] = [];

function servidor(manejador: Manejador) {
  fetchMock.mockImplementation(async (url, init) => {
    const llamada: Llamada = {
      metodo: (init?.method ?? 'GET').toUpperCase(),
      url: String(url),
      cuerpo: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      auth: new Headers(init?.headers).get('authorization'),
    };
    llamadas.push(llamada);
    const r = manejador(llamada) ?? { status: 500, cuerpo: { code: 'INTERNAL', message: 'Error interno' } };
    return new Response(JSON.stringify(r.cuerpo ?? {}), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  });
}

const conSesion = (usuario = CLIENTE) => localStorage.setItem('trasto_sesion', JSON.stringify({ token: 'tok-123', usuario }));
const montar = (ruta: string) =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <App />
    </MemoryRouter>,
  );
const escribir = (etiqueta: RegExp | string, valor: string) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
const escribirEn = (zona: HTMLElement, etiqueta: string, valor: string) =>
  fireEvent.change(within(zona).getByLabelText(etiqueta), { target: { value: valor } });
const formularioNuevo = () => screen.getByRole('form', { name: 'Nueva reliquia' });
const nav = () => screen.getByRole('navigation', { name: 'Principal' });

beforeEach(() => {
  fetchMock.mockReset();
  llamadas = [];
  localStorage.clear();
  delete (window as unknown as { __xss?: number }).__xss;
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('reseñas (F2)', () => {
  const base = (extra?: Manejador): Manejador => (l) =>
    extra?.(l) ??
    (l.url === '/api/v2/relics/1' ? { cuerpo: RELIQUIA } : l.url === '/api/v2/relics/1/reviews' && l.metodo === 'GET' ? { cuerpo: { items: [RESENA, MALICIOSA] } } : undefined);

  it('lista autor y texto; el marcado de una reseña se ve como texto y no se ejecuta', async () => {
    servidor(base());
    montar('/catalogo/1');
    expect(await screen.findByText('Llegó frío y con olor a lluvia.')).toBeTruthy();
    expect(screen.getByText('Camila Soto')).toBeTruthy();
    expect(screen.getByText(/<img src=x onerror="window.__xss=1"><b>negrita<\/b>/)).toBeTruthy();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector('main b')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('sin reseñas lo dice; sin sesión ofrece entrar y no el formulario', async () => {
    servidor((l) => (l.url === '/api/v2/relics/1' ? { cuerpo: RELIQUIA } : l.url.endsWith('/reviews') ? { cuerpo: { items: [] } } : undefined));
    montar('/catalogo/1');
    expect(await screen.findByText('Aún no hay reseñas')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Entra para dejar una reseña' }).getAttribute('href')).toBe('/entrar');
    expect(screen.queryByLabelText('Tu reseña')).toBeNull();
  });

  it('con sesión publica una reseña y aparece sin recargar', async () => {
    conSesion();
    const nueva = { id: 9, author: 'Ana Prueba', body: 'Huele a incienso.', created_at: '2026-10-10 10:00:00' };
    servidor(base((l) => (l.metodo === 'POST' && l.url === '/api/v2/relics/1/reviews' ? { status: 201, cuerpo: nueva } : undefined)));
    montar('/catalogo/1');
    await screen.findByText('Camila Soto');
    escribir('Tu reseña', 'Huele a incienso.');
    fireEvent.click(screen.getByRole('button', { name: 'Publicar reseña' }));
    expect(await screen.findByText('Huele a incienso.')).toBeTruthy();
    const post = llamadas.find((l) => l.metodo === 'POST')!;
    expect(post.cuerpo).toEqual({ body: 'Huele a incienso.' });
    expect(post.auth).toBe('Bearer tok-123');
  });

  it('si el POST falla muestra el mensaje de la API', async () => {
    conSesion();
    servidor(base((l) => (l.metodo === 'POST' ? { status: 400, cuerpo: { code: 'BAD_REQUEST', message: 'Solicitud inválida' } } : undefined)));
    montar('/catalogo/1');
    await screen.findByText('Camila Soto');
    escribir('Tu reseña', 'algo');
    fireEvent.click(screen.getByRole('button', { name: 'Publicar reseña' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Solicitud inválida');
  });

  it('si las reseñas fallan, la ficha sigue visible', async () => {
    servidor((l) => (l.url === '/api/v2/relics/1' ? { cuerpo: RELIQUIA } : { status: 500, cuerpo: { code: 'INTERNAL', message: 'Error interno' } }));
    montar('/catalogo/1');
    expect(await screen.findByRole('heading', { name: 'Espejo de la Viuda' })).toBeTruthy();
    expect(await screen.findByText('No se pudieron cargar las reseñas')).toBeTruthy();
  });
});

describe('perfil (F2)', () => {
  it('sin sesión /perfil lleva a /entrar', () => {
    servidor(() => undefined);
    montar('/perfil');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy();
  });

  it('muestra los datos fijos y edita solo nombre, comuna y teléfono', async () => {
    conSesion();
    servidor((l) => {
      if (l.metodo === 'GET' && l.url === '/api/v2/me') return { cuerpo: PERFIL };
      if (l.metodo === 'PATCH' && l.url === '/api/v2/me') return { cuerpo: { ...PERFIL, name: 'Ana P.', phone: '+56 9 1111 2222' } };
    });
    montar('/perfil');
    await screen.findByDisplayValue('Ana Prueba');
    expect(screen.getByText('12.345.678-5')).toBeTruthy();
    expect(screen.getByText('ana@lab.test')).toBeTruthy();
    expect(screen.getByText(/\$2\.500/)).toBeTruthy();
    expect((screen.getByLabelText('Teléfono') as HTMLInputElement).value).toBe('');
    escribir('Nombre', 'Ana P.');
    escribir('Teléfono', '+56 9 1111 2222');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect((await screen.findByRole('status')).textContent).toContain('Perfil guardado');
    expect(llamadas.find((l) => l.metodo === 'PATCH')?.cuerpo).toEqual({ name: 'Ana P.', commune: 'Valparaíso', phone: '+56 9 1111 2222' });
  });

  it('un error al guardar se muestra en un alert', async () => {
    conSesion();
    servidor((l) => (l.metodo === 'GET' ? { cuerpo: PERFIL } : { status: 400, cuerpo: { code: 'BAD_REQUEST', message: 'Solicitud inválida' } }));
    montar('/perfil');
    await screen.findByDisplayValue('Ana Prueba');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Solicitud inválida');
  });
});

describe('admin (F2)', () => {
  it('el nav muestra perfil a clientes y admin solo a administradores', () => {
    conSesion();
    servidor(() => undefined);
    montar('/');
    expect(within(nav()).getByText(/perfil/)).toBeTruthy();
    expect(within(nav()).queryByText(/admin/)).toBeNull();
    cleanup();
    conSesion(ADMIN);
    montar('/');
    expect(within(nav()).getByText(/admin/)).toBeTruthy();
  });

  it('un cliente no ve el panel ni llama a /admin', () => {
    conSesion();
    servidor(() => undefined);
    montar('/admin');
    expect(screen.getByText('Solo para administradores')).toBeTruthy();
    expect(llamadas.some((l) => l.url.includes('/admin'))).toBe(false);
  });

  it('sin sesión /admin lleva a /entrar', () => {
    servidor(() => undefined);
    montar('/admin');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy();
  });

  it('lista todas las reliquias, también las ocultas, con token de admin', async () => {
    conSesion(ADMIN);
    servidor((l) => (l.url === '/api/v2/admin/relics' ? { cuerpo: ADMIN_RELICS } : undefined));
    montar('/admin');
    expect(await screen.findByRole('row', { name: /Espejo de la Viuda/ })).toBeTruthy();
    expect(screen.getByRole('row', { name: /Caja Oculta/ })).toBeTruthy();
    expect(llamadas[0].auth).toBe('Bearer tok-123');
  });

  it('guarda precio y existencias de una fila con PATCH', async () => {
    conSesion(ADMIN);
    servidor((l) => {
      if (l.metodo === 'GET') return { cuerpo: ADMIN_RELICS };
      if (l.metodo === 'PATCH' && l.url === '/api/v2/admin/relics/1') return { cuerpo: { ...ADMIN_RELICS.items[0], price_clp: 150000, stock: 9 } };
    });
    montar('/admin');
    const fila = await screen.findByRole('row', { name: /Espejo de la Viuda/ });
    fireEvent.change(within(fila).getByLabelText('Precio'), { target: { value: '150000' } });
    fireEvent.change(within(fila).getByLabelText('Existencias'), { target: { value: '9' } });
    fireEvent.click(within(fila).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(llamadas.some((l) => l.metodo === 'PATCH')).toBe(true));
    expect(llamadas.find((l) => l.metodo === 'PATCH')?.cuerpo).toEqual({ price_clp: 150000, stock: 9 });
  });

  it('Ocultar y Publicar mandan solo {published}', async () => {
    conSesion(ADMIN);
    servidor((l) => {
      if (l.metodo === 'GET') return { cuerpo: ADMIN_RELICS };
      if (l.metodo === 'PATCH') return { cuerpo: ADMIN_RELICS.items[0] };
    });
    montar('/admin');
    const fila = await screen.findByRole('row', { name: /Espejo de la Viuda/ });
    fireEvent.click(within(fila).getByRole('button', { name: 'Ocultar' }));
    await waitFor(() => expect(llamadas.some((l) => l.metodo === 'PATCH')).toBe(true));
    expect(llamadas.find((l) => l.metodo === 'PATCH')?.cuerpo).toEqual({ published: false });
    expect(within(screen.getByRole('row', { name: /Caja Oculta/ })).getByRole('button', { name: 'Publicar' })).toBeTruthy();
  });

  it('crea una reliquia sin imagen con números enteros y la muestra en la tabla', async () => {
    conSesion(ADMIN);
    const creada = { id: 3, name: 'Candelabro Roto', description: 'Tres brazos.', price_clp: 45000, stock: 4, image_url: null, published: true };
    servidor((l) => {
      if (l.metodo === 'GET') return { cuerpo: ADMIN_RELICS };
      if (l.metodo === 'POST' && l.url === '/api/v2/admin/relics') return { status: 201, cuerpo: creada };
    });
    montar('/admin');
    await screen.findByRole('row', { name: /Espejo de la Viuda/ });
    escribirEn(formularioNuevo(), 'Nombre', 'Candelabro Roto');
    escribirEn(formularioNuevo(), 'Descripción', 'Tres brazos.');
    escribirEn(formularioNuevo(), 'Precio (CLP)', '45000');
    escribirEn(formularioNuevo(), 'Existencias', '4');
    fireEvent.click(within(formularioNuevo()).getByRole('button', { name: 'Crear reliquia' }));
    expect(await screen.findByRole('row', { name: /Candelabro Roto/ })).toBeTruthy();
    expect(llamadas.find((l) => l.metodo === 'POST')?.cuerpo).toEqual({ name: 'Candelabro Roto', description: 'Tres brazos.', price_clp: 45000, stock: 4, published: true });
  });

  it('con imagen manda content_type y base64 sin prefijo data:', async () => {
    conSesion(ADMIN);
    servidor((l) => {
      if (l.metodo === 'GET') return { cuerpo: ADMIN_RELICS };
      if (l.metodo === 'POST') return { status: 201, cuerpo: { ...ADMIN_RELICS.items[0], id: 4, name: 'Con foto' } };
    });
    montar('/admin');
    await screen.findByRole('row', { name: /Espejo de la Viuda/ });
    escribirEn(formularioNuevo(), 'Nombre', 'Con foto');
    escribirEn(formularioNuevo(), 'Descripción', 'Foto.');
    escribirEn(formularioNuevo(), 'Precio (CLP)', '1000');
    escribirEn(formularioNuevo(), 'Existencias', '1');
    const firma = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const archivo = new File([firma], 'foto.png', { type: 'image/png' });
    fireEvent.change(within(formularioNuevo()).getByLabelText('Imagen'), { target: { files: [archivo] } });
    fireEvent.click(within(formularioNuevo()).getByRole('button', { name: 'Crear reliquia' }));
    await waitFor(() => expect(llamadas.some((l) => l.metodo === 'POST')).toBe(true));
    const cuerpo = llamadas.find((l) => l.metodo === 'POST')!.cuerpo as { image: { content_type: string; data_base64: string } };
    expect(cuerpo.image).toEqual({ content_type: 'image/png', data_base64: Buffer.from(firma).toString('base64') });
  });

  it('un error de la API al crear se muestra en un alert', async () => {
    conSesion(ADMIN);
    servidor((l) => (l.metodo === 'GET' ? { cuerpo: ADMIN_RELICS } : { status: 400, cuerpo: { code: 'BAD_REQUEST', message: 'Solicitud inválida' } }));
    montar('/admin');
    await screen.findByRole('row', { name: /Espejo de la Viuda/ });
    escribirEn(formularioNuevo(), 'Nombre', 'X');
    escribirEn(formularioNuevo(), 'Descripción', 'Y');
    escribirEn(formularioNuevo(), 'Precio (CLP)', '1');
    escribirEn(formularioNuevo(), 'Existencias', '1');
    fireEvent.click(within(formularioNuevo()).getByRole('button', { name: 'Crear reliquia' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Solicitud inválida');
  });
});
