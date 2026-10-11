import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Solo loopback, como la API: el laboratorio no se expone en la red.
  server: {
    host: '127.0.0.1',
    // La API del laboratorio escucha en 127.0.0.1:3001 (PORT); el humo E2E la mueve con API_PORT.
    proxy: { '/api': `http://127.0.0.1:${process.env.API_PORT ?? 3001}` },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
