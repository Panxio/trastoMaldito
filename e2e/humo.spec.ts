// Humo E2E (Tarea 13): el flujo completo de la tienda, con todas las vulns en off.
// Registro → buscar → carrito → cupón → pagar → ver el pedido.
import { expect, test } from '@playwright/test';

const BASE = () => process.env.E2E_BASE_URL as string;

test('registro, búsqueda, carrito, cupón, pago y pedido', async ({ page }) => {
  // Registro (RUT con dígito verificador válido; datos ficticios del laboratorio).
  await page.goto(`${BASE()}/registro`);
  await page.getByLabel('Nombre', { exact: true }).fill('Persona de Humo');
  await page.getByLabel('RUT').fill('12345678-5');
  await page.getByLabel('Comuna').fill('Valparaíso');
  await page.getByLabel('Correo').fill('humo@trastomaldito.test');
  await page.getByLabel('Contraseña').fill('clave-de-humo-1');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/catalogo$/);

  // Búsqueda y ficha.
  await page.getByLabel('Buscar').fill('Espejo');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('link', { name: /Espejo de la Viuda/ }).first().click();
  await page.getByRole('button', { name: 'Añadir al carrito' }).click();
  await expect(page.getByText('Añadida al carrito.')).toBeVisible();

  // Carrito y cupón (50 % sobre $189.990).
  await page.getByRole('link', { name: /carrito/ }).click();
  await page.getByLabel('Código de cupón').fill('EXORCISMO');
  await page.getByRole('button', { name: 'Aplicar cupón' }).click();
  await expect(page.getByText('Cupón EXORCISMO (50 %)')).toBeVisible();

  // Pago con tarjeta que la pasarela falsa aprueba.
  await page.getByRole('link', { name: 'Pagar', exact: true }).click();
  await expect(page.getByText('$94.995').first()).toBeVisible();
  await page.getByLabel('Número de tarjeta').fill('4242 4242 4242 4242');
  await page.getByRole('button', { name: 'Pagar ahora' }).click();

  // Pedido pagado, con el total descontado.
  await expect(page).toHaveURL(/\/pedidos\/\d+$/);
  await expect(page.getByText('Estado: pagado')).toBeVisible();
  await expect(page.getByText('$94.995').first()).toBeVisible();
});
