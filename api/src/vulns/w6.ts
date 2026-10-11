import { flags } from '../flags.js';
import { cobrar } from '../payment.js';

// W6 — Un fallo del pago deja el pedido pagado (A10:2025 Mishandling of Exceptional Conditions).
// Único lugar del proyecto con `if (flags.W6)`; el checkout solo llama a pagoAprobado y, si el
// pago NO está aprobado, marca el pedido failed y responde 402. La pasarela falsa (payment.ts)
// lanza cuando rechaza; lo que decide esta función es cómo se trata esa excepción.
//
// off (corrección): fail closed. Un cobro que lanza es un pago NO aprobado → devuelve false;
//   no se descuenta stock ni se marca paid.
// on (defecto a propósito): se traga la excepción y se declara aprobado igual → true. El pedido
//   queda paid sin cobro exitoso: se compra gratis con una tarjeta rechazada.
export async function pagoAprobado(cardNumber: string, montoClp: number): Promise<boolean> {
  if (!flags.W6) {
    try {
      await cobrar(cardNumber, montoClp);
      return true;
    } catch {
      return false;
    }
  }
  try {
    await cobrar(cardNumber, montoClp);
  } catch {
    // on: la excepción del cobro se ignora a propósito.
  }
  return true;
}
