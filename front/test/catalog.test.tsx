import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

const RELIQUIAS = [
  { id: 1, name: 'Espejo de la Viuda', description: 'Espejo de marco ennegrecido.', price_clp: 189990, stock: 3, image_url: '/img/espejo.png' },
  { id: 2, name: 'Caja Musical de Valparaíso', description: 'Caja de nogal.', price_clp: 74500, stock: 5, image_url: '/img/caja.png' },
];
const MALICIOSA = {
  id: 9, name: 'Reliquia <b>negrita</b>', description: '<img src=x onerror="window.__xss=1"> texto', price_clp: 1000, stock: 1, image_url: null,
};

function json(cuerpo: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } }));
}

function montar(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <App />
    </MemoryRouter>,
  );
}

describe('páginas del catálogo (M1)', () => {
  const fetchMock = vi.fn<(url: string) => Promise<Response>>();
  const urls = () => fetchMock.mock.calls.map(([u]) => String(u));

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    delete (window as unknown as { __xss?: number }).__xss;
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('/catalogo lista las reliquias como enlaces a su ficha, con precio en pesos', async () => {
    fetchMock.mockImplementation(() => json({ items: RELIQUIAS }));
    montar('/catalogo');

    const enlace = await screen.findByRole('link', { name: /Espejo de la Viuda/ });
    expect(enlace.getAttribute('href')).toBe('/catalogo/1');
    expect(screen.getByRole('link', { name: /Caja Musical de Valparaíso/ }).getAttribute('href')).toBe('/catalogo/2');
    expect(screen.getByText(/\$\s?189\.990/)).toBeTruthy();
    expect(urls()[0]).toMatch(/\/api\/v2\/relics$/);
  });

  it('buscar envía q codificado a la API y muestra solo lo devuelto', async () => {
    fetchMock.mockImplementation((url) =>
      String(url).includes('q=') ? json({ items: [RELIQUIAS[1]] }) : json({ items: RELIQUIAS }),
    );
    montar('/catalogo');
    await screen.findByRole('link', { name: /Espejo de la Viuda/ });

    const campo = screen.getByLabelText('Buscar');
    fireEvent.change(campo, { target: { value: 'caja & 100%' } });
    fireEvent.submit(campo.closest('form')!);

    await waitFor(() => expect(urls().some((u) => u.includes('/api/v2/relics?q=caja%20%26%20100%25'))).toBe(true));
    await waitFor(() => expect(screen.queryByRole('link', { name: /Espejo de la Viuda/ })).toBeNull());
    expect(screen.getByRole('link', { name: /Caja Musical/ })).toBeTruthy();
  });

  it('sin resultados muestra «Sin resultados»', async () => {
    fetchMock.mockImplementation(() => json({ items: [] }));
    montar('/catalogo');

    expect(await screen.findByText('Sin resultados')).toBeTruthy();
  });

  it('/catalogo/:id muestra nombre, descripción, precio y stock', async () => {
    fetchMock.mockImplementation(() => json(RELIQUIAS[0]));
    montar('/catalogo/1');

    expect((await screen.findByRole('heading', { level: 1, name: 'Espejo de la Viuda' })).textContent).toBe('Espejo de la Viuda');
    expect(screen.getByText(/Espejo de marco ennegrecido/)).toBeTruthy();
    expect(screen.getByText(/\$\s?189\.990/)).toBeTruthy();
    expect(screen.getByText(/\b3\b/)).toBeTruthy();
    expect(urls()[0]).toMatch(/\/api\/v2\/relics\/1$/);
  });

  it('/catalogo/:id con 404 de la API muestra «Reliquia no encontrada»', async () => {
    fetchMock.mockImplementation(() => json({ code: 'NOT_FOUND', message: 'Recurso no encontrado' }, 404));
    montar('/catalogo/999');

    expect(await screen.findByText('Reliquia no encontrada')).toBeTruthy();
  });

  it('el texto de la API se muestra como texto, nunca como HTML', async () => {
    fetchMock.mockImplementation(() => json(MALICIOSA));
    const { container } = montar('/catalogo/9');

    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Reliquia <b>negrita</b>');
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.querySelector('h1 b')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });
});
