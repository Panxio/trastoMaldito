import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

type Llamada = { metodo: string; url: string; cuerpo: unknown; auth: string | null };
type Respuesta = { status?: number; cuerpo?: unknown };
type Manejador = (llamada: Llamada) => Respuesta | undefined;

const USUARIO = { id: 7, email: 'ana@lab.test', name: 'Ana Prueba', role: 'customer' };
const CARRITO = {
  items: [{ relic_id: 1, name: 'Espejo de la Viuda', price_clp: 189990, qty: 2, subtotal_clp: 379980 }],
  coupon: null, subtotal_clp: 379980, discount_clp: 0, total_clp: 379980,
};
const CARRITO_VACIO = { items: [], coupon: null, subtotal_clp: 0, discount_clp: 0, total_clp: 0 };
const PEDIDO = {
  id: 42, customer_id: 7, status: 'paid', total_clp: 379980, coupon_code: null, created_at: '2026-10-10 10:00:00',
  items: [{ relic_id: 1, name: 'Espejo de la Viuda', qty: 2, price_clp: 189990 }],
};
const RELIQUIA = { id: 1, name: 'Espejo de la Viuda', description: 'Marco ennegrecido.', price_clp: 189990, stock: 3, image_url: null };

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
let llamadas: Llamada[] = [];

// Cada prueba define las rutas que existen; cualquier otra devuelve 500 para que un fetch inesperado falle a la vista.
function servidor(manejador: Manejador) {
  fetchMock.mockImplementation(async (url, init) => {
    const cabeceras = new Headers(init?.headers);
    const llamada: Llamada = {
      metodo: (init?.method ?? 'GET').toUpperCase(),
      url: String(url),
      cuerpo: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      auth: cabeceras.get('authorization'),
    };
    llamadas.push(llamada);
    const r = manejador(llamada) ?? { status: 500, cuerpo: { code: 'INTERNAL', message: 'Error interno' } };
    return new Response(JSON.stringify(r.cuerpo ?? {}), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  });
}

function conSesion() {
  localStorage.setItem('trasto_sesion', JSON.stringify({ token: 'tok-123', usuario: USUARIO }));
}

function montar(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <App />
    </MemoryRouter>,
  );
}

const escribir = (etiqueta: RegExp | string, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

beforeEach(() => {
  fetchMock.mockReset();
  llamadas = [];
  localStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('sesión (F1)', () => {
  it('entrar: envía credenciales, guarda la sesión y muestra el nav de cliente', async () => {
    servidor((l) => {
      if (l.metodo === 'POST' && l.url === '/api/v2/auth/login') return { cuerpo: { token: 'tok-123', user: USUARIO } };
      if (l.url === '/api/v2/relics') return { cuerpo: { items: [] } };
    });
    montar('/entrar');
    escribir('Correo', 'ana@lab.test');
    escribir('Contraseña', 'secreta-123');
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Catálogo' })).toBeTruthy());
    expect(llamadas.find((l) => l.url.endsWith('/auth/login'))?.cuerpo).toEqual({ email: 'ana@lab.test', password: 'secreta-123' });
    expect(JSON.parse(localStorage.getItem('trasto_sesion') ?? '{}').token).toBe('tok-123');
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByText(/carrito/)).toBeTruthy();
    expect(within(nav).getByText(/pedidos/)).toBeTruthy();
    expect(within(nav).getByRole('button', { name: 'Salir' })).toBeTruthy();
  });

  it('entrar con credenciales malas muestra el mensaje de la API en un alert y no guarda sesión', async () => {
    servidor((l) => (l.url.endsWith('/auth/login') ? { status: 401, cuerpo: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' } } : undefined));
    montar('/entrar');
    escribir('Correo', 'ana@lab.test');
    escribir('Contraseña', 'mala');
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Credenciales inválidas');
    expect(localStorage.getItem('trasto_sesion')).toBeNull();
  });

  it('sin sesión el nav ofrece entrar y no el carrito', () => {
    servidor(() => undefined);
    montar('/');
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByText(/entrar/)).toBeTruthy();
    expect(within(nav).queryByText(/carrito/)).toBeNull();
  });

  it('salir borra la sesión', () => {
    conSesion();
    servidor(() => undefined);
    montar('/');
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(localStorage.getItem('trasto_sesion')).toBeNull();
    expect(within(screen.getByRole('navigation', { name: 'Principal' })).getByText(/entrar/)).toBeTruthy();
  });

  it('registro: manda los campos, luego inicia sesión sola', async () => {
    servidor((l) => {
      if (l.url.endsWith('/auth/register')) return { status: 201, cuerpo: { user: USUARIO } };
      if (l.url.endsWith('/auth/login')) return { cuerpo: { token: 'tok-123', user: USUARIO } };
      if (l.url === '/api/v2/relics') return { cuerpo: { items: [] } };
    });
    montar('/registro');
    escribir('Nombre', 'Ana Prueba');
    escribir('RUT', '12.345.678-5');
    escribir('Comuna', 'Valparaíso');
    escribir('Correo', 'ana@lab.test');
    escribir('Contraseña', 'secreta-123');
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await waitFor(() => expect(localStorage.getItem('trasto_sesion')).not.toBeNull());
    const reg = llamadas.find((l) => l.url.endsWith('/auth/register'))!;
    expect(reg.cuerpo).toEqual({ email: 'ana@lab.test', password: 'secreta-123', name: 'Ana Prueba', rut: '12.345.678-5', commune: 'Valparaíso' });
    expect(llamadas.some((l) => l.url.endsWith('/auth/login'))).toBe(true);
  });
});

describe('carrito (F1)', () => {
  it('sin sesión /carrito lleva a /entrar', () => {
    servidor(() => undefined);
    montar('/carrito');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy();
  });

  it('lista líneas con precios en pesos y manda el token', async () => {
    conSesion();
    servidor((l) => (l.url === '/api/v2/cart' ? { cuerpo: CARRITO } : undefined));
    montar('/carrito');
    expect(await screen.findByText('Espejo de la Viuda')).toBeTruthy();
    expect(screen.getAllByText('$379.980').length).toBeGreaterThan(0);
    expect(llamadas[0].auth).toBe('Bearer tok-123');
  });

  it('carrito vacío lo dice y no ofrece pagar', async () => {
    conSesion();
    servidor((l) => (l.url === '/api/v2/cart' ? { cuerpo: CARRITO_VACIO } : undefined));
    montar('/carrito');
    expect(await screen.findByText('Tu carrito está vacío')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Pagar/ }) ?? screen.queryByRole('button', { name: /Pagar/ })).toBeNull();
  });

  it('quitar una línea llama DELETE /cart/items/:id', async () => {
    conSesion();
    servidor((l) => {
      if (l.metodo === 'GET' && l.url === '/api/v2/cart') return { cuerpo: CARRITO };
      if (l.metodo === 'DELETE' && l.url === '/api/v2/cart/items/1') return { cuerpo: CARRITO_VACIO };
    });
    montar('/carrito');
    fireEvent.click(await screen.findByRole('button', { name: /Quitar/ }));
    await waitFor(() => expect(llamadas.some((l) => l.metodo === 'DELETE' && l.url === '/api/v2/cart/items/1')).toBe(true));
  });

  it('aplicar cupón manda el código y muestra el error de la API', async () => {
    conSesion();
    servidor((l) => {
      if (l.metodo === 'GET' && l.url === '/api/v2/cart') return { cuerpo: CARRITO };
      if (l.metodo === 'POST' && l.url === '/api/v2/cart/coupon') return { status: 404, cuerpo: { code: 'NOT_FOUND', message: 'Cupón no válido' } };
    });
    montar('/carrito');
    await screen.findByText('Espejo de la Viuda');
    escribir('Código de cupón', 'BIENVENIDA10');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar cupón' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Cupón no válido');
    expect(llamadas.find((l) => l.url.endsWith('/cart/coupon'))?.cuerpo).toEqual({ code: 'BIENVENIDA10' });
  });

  it('añadir desde la ficha lee el carrito y sube la cantidad en uno', async () => {
    conSesion();
    servidor((l) => {
      if (l.url === '/api/v2/relics/1') return { cuerpo: RELIQUIA };
      if (l.metodo === 'GET' && l.url === '/api/v2/cart') return { cuerpo: CARRITO };
      if (l.metodo === 'PUT' && l.url === '/api/v2/cart/items/1') return { cuerpo: CARRITO };
    });
    montar('/catalogo/1');
    fireEvent.click(await screen.findByRole('button', { name: 'Añadir al carrito' }));
    await waitFor(() => expect(llamadas.some((l) => l.metodo === 'PUT')).toBe(true));
    expect(llamadas.find((l) => l.metodo === 'PUT')?.cuerpo).toEqual({ qty: 3 });
  });
});

describe('pago y pedidos (F1)', () => {
  it('pagar manda la tarjeta a /checkout y va al detalle del pedido', async () => {
    conSesion();
    servidor((l) => {
      if (l.metodo === 'GET' && l.url === '/api/v2/cart') return { cuerpo: CARRITO };
      if (l.metodo === 'POST' && l.url === '/api/v2/checkout') return { status: 201, cuerpo: PEDIDO };
      if (l.url === '/api/v2/orders/42') return { cuerpo: PEDIDO };
    });
    montar('/pago');
    await screen.findByText(/\$379\.980/);
    escribir('Número de tarjeta', '4242 4242 4242 4242');
    fireEvent.click(screen.getByRole('button', { name: 'Pagar ahora' }));
    await screen.findByText('Espejo de la Viuda');
    expect(llamadas.find((l) => l.url.endsWith('/checkout'))?.cuerpo).toEqual({ card_number: '4242424242424242' });
    expect(screen.getByText(/pagado/i)).toBeTruthy();
  });

  it('si el pago falla muestra el mensaje y se queda en /pago', async () => {
    conSesion();
    servidor((l) => {
      if (l.metodo === 'GET' && l.url === '/api/v2/cart') return { cuerpo: CARRITO };
      if (l.url === '/api/v2/checkout') return { status: 402, cuerpo: { code: 'PAYMENT_DECLINED', message: 'Pago rechazado' } };
    });
    montar('/pago');
    await screen.findByText(/\$379\.980/);
    escribir('Número de tarjeta', '4000 0000 0000 0002');
    fireEvent.click(screen.getByRole('button', { name: 'Pagar ahora' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Pago rechazado');
    expect(screen.getByRole('button', { name: 'Pagar ahora' })).toBeTruthy();
  });

  it('/pedidos lista los pedidos con estado en español y enlace al detalle', async () => {
    conSesion();
    servidor((l) => (l.url === '/api/v2/orders' ? { cuerpo: { items: [PEDIDO, { ...PEDIDO, id: 41, status: 'failed' }] } } : undefined));
    montar('/pedidos');
    const enlace = await screen.findByRole('link', { name: /42/ });
    expect(enlace.getAttribute('href')).toBe('/pedidos/42');
    expect(screen.getByText(/pagado/i)).toBeTruthy();
    expect(screen.getByText(/fallido/i)).toBeTruthy();
  });

  it('un 401 cierra la sesión', async () => {
    conSesion();
    servidor((l) => (l.url === '/api/v2/orders' ? { status: 401, cuerpo: { code: 'UNAUTHENTICATED', message: 'Autenticación requerida' } } : undefined));
    montar('/pedidos');
    await waitFor(() => expect(localStorage.getItem('trasto_sesion')).toBeNull());
  });
});
