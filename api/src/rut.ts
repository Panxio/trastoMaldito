// RUT chileno: cuerpo numérico + dígito verificador por módulo 11.
// Los datos del laboratorio son ficticios; estas funciones solo dan formato válido.

const PESOS = [2, 3, 4, 5, 6, 7];

// Formato aceptado: cuerpo con o sin puntos de miles, guion opcional, DV 0-9 o K/k.
const FORMATO = /^(\d{1,2}(?:\.\d{3}){2}|\d{1,8})-?([\dkK])$/;

export function dvRut(cuerpo: number): string {
  if (!Number.isInteger(cuerpo) || cuerpo < 0) {
    throw new RangeError(`El cuerpo del RUT debe ser un entero no negativo (recibido: ${cuerpo})`);
  }

  let suma = 0;
  let resto = cuerpo;
  for (let i = 0; resto > 0; i++) {
    suma += (resto % 10) * PESOS[i % PESOS.length];
    resto = Math.floor(resto / 10);
  }

  const dv = 11 - (suma % 11);
  if (dv === 11) return '0';
  if (dv === 10) return 'K';
  return String(dv);
}

export function validarRut(rut: string): boolean {
  const m = FORMATO.exec(rut);
  if (!m) return false;

  const cuerpo = Number(m[1].replaceAll('.', ''));
  if (cuerpo === 0) return false; // un RUT real nunca tiene cuerpo 0 (0-0 pasaría módulo 11)
  return dvRut(cuerpo) === m[2].toUpperCase();
}

// Forma canónica NN.NNN.NNN-D (K mayúscula). Asume un RUT ya validado con validarRut.
export function formatearRut(rut: string): string {
  const limpio = rut.replaceAll('.', '').replace('-', '').toUpperCase();
  const cuerpo = limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpo}-${limpio.slice(-1)}`;
}
