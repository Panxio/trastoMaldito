import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';

const BANNER = 'App vulnerable a propósito — solo laboratorio';

function renderEn(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <App />
    </MemoryRouter>,
  );
}

describe('Banner de laboratorio', () => {
  it('se muestra en /', () => {
    renderEn('/');

    expect(screen.getByText(BANNER)).toBeTruthy();
  });

  it('se muestra en una ruta cualquiera', () => {
    renderEn('/una/ruta/cualquiera');

    expect(screen.getByText(BANNER)).toBeTruthy();
  });
});
