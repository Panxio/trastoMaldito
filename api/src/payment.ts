// Pasarela de pago falsa para el laboratorio: sin red y sin dependencias.
// La tarjeta 4000000000000002 siempre es rechazada; cualquier otra se aprueba.
const TARJETA_RECHAZADA = '4000000000000002';

// Latencia simulada de la pasarela: una pasarela real hace I/O, y sin este `await` real el event
// loop atiende los checkouts uno tras otro y la carrera del cupón (W5) no puede ocurrir.
const LATENCIA_MS = 50;

// Lanza si el pago falla. Quien llama trata cualquier excepción como pago no aprobado.
export async function cobrar(cardNumber: string, montoClp: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, LATENCIA_MS));
  if (!Number.isInteger(montoClp) || montoClp < 0) throw new Error('Monto inválido');
  if (cardNumber === TARJETA_RECHAZADA) throw new Error('Pago rechazado por la pasarela falsa');
}
