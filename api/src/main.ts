import { mkdirSync } from 'node:fs';
import { startServer } from './server.js';

const port = Number(process.env.PORT || '3001');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`PORT debe ser un entero entre 1 y 65535 (recibido: "${process.env.PORT}")`);
}

const dbPath = process.env.DB_PATH;

// Carpeta de imágenes del admin: se crea si falta.
const uploadDir = process.env.UPLOAD_DIR || './uploads';
mkdirSync(uploadDir, { recursive: true });

await startServer({ port, dbPath, jwtSecret: process.env.JWT_SECRET, uploadDir });
console.log(`API escuchando en http://127.0.0.1:${port}`);
