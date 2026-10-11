import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { flags } from '../flags.js';
import { ApiError } from '../errors.js';

// A5 — SSRF al publicar reliquia con imagen por URL (API7:2023 SSRF · A01:2025).
// Único lugar del proyecto con `if (flags.A5)`; la ruta de admin solo llama a este wrapper
// cuando el cuerpo trae `image_url`. El wrapper decide si aplica el guard anti-SSRF antes del
// `fetch`. La detección de tipo y el guardado los sigue haciendo admin.ts sobre el Buffer.
//
// off (corrección): antes de traer nada se valida la URL: solo http(s) y se RECHAZA todo host
//   que resuelva a loopback/privado/link-local. Nunca se hace la petición a un destino interno.
// on (defecto a propósito): se hace `fetch` a la URL SIN validarla. Un admin (o quien tome su
//   sesión) apunta `image_url` a una dirección interna y el servidor la consulta por él: SSRF.
const MAX_IMAGEN = 1024 * 1024;

function invalido(): ApiError {
  return new ApiError(400, 'BAD_REQUEST', 'Solicitud inválida');
}

// Rangos a negar: no especificada, loopback, privados y link-local (IPv4 e IPv6). No cubre DNS
// rebinding a propósito (la lección es validar el destino, no cada vector); las redirecciones 3xx
// sí se cubren, cortándolas en traerImagenDesdeUrl (redirect:'manual').
function esInterna(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0) return true; // 0.0.0.0/8 "este host"; 0.0.0.0 llega a loopback en Linux
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 10) return true; // 10.0.0.0/8 privado
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 privado
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 privado
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
    return false;
  }
  if (version === 6) {
    const bajo = ip.toLowerCase();
    if (bajo === '::' || bajo === '::1') return true; // no especificada y loopback
    if (bajo.startsWith('fe80')) return true; // link-local
    if (bajo.startsWith('fc') || bajo.startsWith('fd')) return true; // ULA fc00::/7
    // Mapeado a IPv4 (::ffff:127.0.0.1): revisa la parte v4.
    const m = /::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(bajo);
    if (m) return esInterna(m[1]);
    return false;
  }
  return false;
}

async function validarDestino(urlStr: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw invalido();
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw invalido();

  // Resolver el host a todas sus direcciones y negar si ALGUNA es interna. Un literal IP
  // (p. ej. 127.0.0.1) se resuelve a sí mismo, así que este mismo camino lo cubre.
  let direcciones: { address: string }[];
  try {
    direcciones = await lookup(url.hostname, { all: true });
  } catch {
    throw invalido();
  }
  if (direcciones.length === 0 || direcciones.some((d) => esInterna(d.address))) throw invalido();
}

export async function traerImagenDesdeUrl(urlStr: string): Promise<Buffer> {
  // off: valida esquema y destino antes de tocar la red; un destino interno rebota con 400 y el
  // `fetch` nunca ocurre. on: no se valida y se trae lo que sea (incluido un servicio interno).
  if (!flags.A5) await validarDestino(urlStr);

  // off: redirect:'manual' para que un 3xx (externo→interno) no se siga a ciegas; un 3xx deja
  // resp.ok=false y rebota con 400. on: se siguen las redirecciones (SSRF más realista).
  let resp: Response;
  try {
    resp = await fetch(urlStr, flags.A5 ? {} : { redirect: 'manual' });
  } catch {
    throw invalido();
  }
  if (!resp.ok) throw invalido();
  const bytes = Buffer.from(await resp.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_IMAGEN) throw invalido();
  return bytes;
}
