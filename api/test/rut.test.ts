import { describe, expect, it } from 'vitest';
import { dvRut, formatearRut, validarRut } from '../src/rut.js';

describe('validarRut', () => {
  it('acepta un RUT válido con puntos y guion', () => {
    expect(validarRut('12.345.678-5')).toBe(true);
  });

  it('rechaza un RUT bueno con el dígito verificador alterado', () => {
    expect(validarRut('12.345.678-9')).toBe(false);
  });

  it('acepta un RUT cuyo dígito verificador es 1', () => {
    expect(validarRut('11.111.111-1')).toBe(true);
  });

  it('acepta K en mayúscula y minúscula, con o sin puntos y guion', () => {
    expect(validarRut('40.000.000-K')).toBe(true);
    expect(validarRut('40.000.000-k')).toBe(true);
    expect(validarRut('40000000K')).toBe(true);
  });

  it.each([
    '',
    'abc',
    '12345678',
    '12.345.678-',
    '12.34.5678-5',
    '123456789-5',
    '12.345.678-55',
    '12.345.678-A',
    '12.345.678-5 ',
    '1-2-3',
    '<script>',
    '0-0',
  ])('rechaza basura: %j', (rut) => {
    expect(validarRut(rut)).toBe(false);
  });
});

describe('dvRut', () => {
  it('calcula el dígito verificador por módulo 11, incluido K y 0', () => {
    expect(dvRut(12345678)).toBe('5');
    expect(dvRut(11111111)).toBe('1');
    expect(dvRut(40000000)).toBe('K');
    expect(dvRut(17234567)).toBe('0');
  });

  it('todo cuerpo con su dígito calculado pasa validarRut', () => {
    for (let cuerpo = 1; cuerpo <= 2000; cuerpo++) {
      expect(validarRut(`${cuerpo}-${dvRut(cuerpo)}`)).toBe(true);
    }
  });

  it('rechaza cuerpos que no son enteros no negativos', () => {
    expect(() => dvRut(-1)).toThrow(RangeError);
    expect(() => dvRut(1.5)).toThrow(RangeError);
  });
});

describe('formatearRut', () => {
  it('devuelve la forma canónica con puntos, guion y K mayúscula', () => {
    expect(formatearRut('15678901-1')).toBe('15.678.901-1');
    expect(formatearRut('15.678.901-1')).toBe('15.678.901-1');
    expect(formatearRut('156789011')).toBe('15.678.901-1');
    expect(formatearRut('1.000.005-k')).toBe('1.000.005-K');
  });
});
