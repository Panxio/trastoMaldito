# TrastoMaldito

[English](README.md) · **Español**

> ⚠️ **App vulnerable a propósito — solo laboratorio.** Escucha únicamente en `127.0.0.1`, con datos
> 100 % ficticios. No se despliega ni se apunta contra sistemas de terceros.

Tienda en línea de objetos paranormales y antigüedades malditas, construida **con defectos de seguridad
a propósito** para practicar pentesting web y de APIs (en la línea de OWASP Juice Shop, DVWA o
WebGoat). Es un laboratorio para quien está aprendiendo ethical hacking, venga de un curso, un
bootcamp, un programa de posgrado o sea autodidacta: cada defecto se puede encender, explotar, apagar y
comprobar que la corrección lo bloquea.

## Cómo funciona

- **16 vulnerabilidades**, cada una con un ID, un flag `VULN_<ID>=on|off`, un archivo propio en
  `api/src/vulns/`, una ficha didáctica (`fichas/`) y una spec (`specs/`).
- **Todo está `off` por defecto** (la tienda sana). Con `VULN_<ID>=on` se activa el defecto. Los flags
  se leen **una vez al arrancar**: para cambiar uno, reinicia la API.
- Cada vulnerabilidad tiene una **versión corregida** (`off`) y un **exploit check** que da
  *explotado* con `on` y *bloqueado* con `off`. Esa tabla es el arnés del proyecto.

## Capturas

La tienda sana (todos los flags `off`), con datos ficticios.

| | |
|---|---|
| ![Catálogo](docs/capturas/01-catalogo.png)<br>Catálogo | ![Ficha de reliquia](docs/capturas/02-ficha-reliquia.png)<br>Ficha de reliquia |
| ![Carrito con cupón](docs/capturas/03-carrito-cupon.png)<br>Carrito con cupón | ![Pago](docs/capturas/04-pago.png)<br>Pago |
| ![Pedido pagado](docs/capturas/05-pedido-pagado.png)<br>Pedido pagado | ![Perfil](docs/capturas/06-perfil.png)<br>Perfil |
| ![Admin de inventario](docs/capturas/07-admin-inventario.png)<br>Admin de inventario | |

## Puesta en marcha

Requisitos: Node 22+ y Python 3 (solo para el arnés).

```bash
npm install
npm run seed
```

`npm run seed` crea `db/lab.sqlite` con datos ficticios (es seguro repetirlo: parte de cero).
Para levantar la API y el front con la tienda sana:

```bash
DB_PATH=db/lab.sqlite npm run dev
```

La API escucha en `http://127.0.0.1:3001` (variable `PORT`) y el front en `http://127.0.0.1:5173`.
Para activar una o más vulnerabilidades, ponles su flag al arrancar:

```bash
DB_PATH=db/lab.sqlite VULN_W1=on VULN_A07=on npm run dev
```

Las cuentas del laboratorio (admin y dos clientes) están en `db/fixtures.json`; sus claves son
falsas y lo dicen. Las imágenes subidas por el admin van a `UPLOAD_DIR` (por defecto `./uploads`).

## Las vulnerabilidades

Flujo de la tienda donde vive cada una y su categoría OWASP. El detalle de cada defecto, su
corrección y cómo practicarlo está en su ficha.

| ID | Categoría OWASP | Flujo de la tienda | Ficha |
|---|---|---|---|
| `W1` | A05:2025 Injection | Buscador del catálogo | [W1](fichas/W1.md) |
| `W2` | A05:2025 Injection | Reseñas de reliquias | [W2](fichas/W2.md) |
| `W3` | A02:2025 Security Misconfiguration | Errores de la API | [W3](fichas/W3.md) |
| `W4` | A04:2025 Cryptographic Failures | Contraseñas de las cuentas | [W4](fichas/W4.md) |
| `W5` | A06:2025 Insecure Design | Cupón «Exorcismo −50 %» | [W5](fichas/W5.md) |
| `W6` | A10:2025 Mishandling of Exceptional Conditions | Pago y estado del pedido | [W6](fichas/W6.md) |
| `A07` | A07:2025 Authentication Failures | Inicio de sesión | [A07](fichas/A07.md) |
| `A09` | A09:2025 Security Logging & Alerting Failures | Auth y checkout | [A09](fichas/A09.md) |
| `A08` | A08:2025 Software or Data Integrity Failures | Webhook de la pasarela de pago | [A08](fichas/A08.md) |
| `A1` | API1:2023 Broken Object Level Authorization | Pedidos de los clientes | [A1](fichas/A1.md) |
| `A2` | API2:2023 Broken Authentication | Sesión con token | [A2](fichas/A2.md) |
| `A3` | API3:2023 Broken Object Property Level Authorization | Perfil del cliente | [A3](fichas/A3.md) |
| `API4` | API4:2023 Unrestricted Resource Consumption | Lista del catálogo | [API4](fichas/API4.md) |
| `API5` | API5:2023 Broken Function Level Authorization | Inventario del admin | [API5](fichas/API5.md) |
| `A4` | API9:2023 Improper Inventory Management | Versiones de la API | [A4](fichas/A4.md) |
| `A5` | API7:2023 SSRF (A01:2025) | Imagen de reliquia desde URL | [A5](fichas/A5.md) |

> Los IDs son etiquetas del laboratorio, no el número de la categoría OWASP (p. ej. `A4` es API9,
> y `API4` es API4). El flag usa siempre el ID de la tabla.

## El arnés: la tabla on/off

`exploits/run.py` arranca, por cada ID y modo, una API nueva sobre una copia limpia de la BD y en
un puerto libre, ejecuta el check `exploits/test_<id>.py` y apaga la API. Éxito por fila:
`on` explotado y `off` bloqueado. Un check que no se pudo correr cuenta como ❌, nunca como verde.

```bash
python3 -m venv .venv && .venv/bin/pip install -r exploits/requirements.txt
npm run exploits
```

Para una o varias vulns: `.venv/bin/python exploits/run.py --only W1,A07`. El resto de las pruebas:

```bash
npm run typecheck                 # tipos (api y front)
npm test                          # vitest de la API y del front
.venv/bin/python -m pytest exploits/test_runner.py   # pruebas del propio runner
npx playwright install chromium   # una sola vez
npm run e2e                       # humo E2E: registro, búsqueda, carrito, cupón, pago y pedido
```

## Estructura

```
api/src/            tienda limpia (Fastify + TypeScript + SQLite)
api/src/vulns/      un archivo por vulnerabilidad: ahí vive su único `if (flags.<ID>)`
api/src/flags.ts    lee VULN_<ID> una vez al arrancar
front/              tienda (React + Vite + Tailwind)
db/                 schema.sql, fixtures.json (datos ficticios) y seed.ts
exploits/           run.py (el arnés) y un test_<id>.py por vulnerabilidad
e2e/                humo E2E con Playwright
specs/  fichas/     spec de cada vulnerabilidad y su ficha didáctica
docs/               capturas y límites conocidos (DEUDAS.md)
```

## Variables de entorno

| Variable | Qué hace |
|---|---|
| `DB_PATH` | Ruta de la SQLite que usa la API (obligatoria para tener tienda; sin ella solo responde `/health`) |
| `PORT` | Puerto de la API (por defecto 3001) |
| `UPLOAD_DIR` | Carpeta de imágenes subidas (por defecto `./uploads`) |
| `JWT_SECRET` | Secreto de los tokens (por defecto uno aleatorio por arranque; `A2` lo debilita) |
| `VULN_<ID>` | `on` o `off`; cualquier otro valor aborta el arranque |

El host no es configurable: `127.0.0.1` está fijo en el código.

## Uso responsable

Esta app es vulnerable **a propósito**. Úsala solo en tu propia máquina (por eso escucha únicamente en
`127.0.0.1`) y nunca la expongas a internet. Las técnicas que practicas aquí solo se aplican contra
sistemas propios o con autorización por escrito.

## Cómo está construida

Cada defecto vive solo en su módulo y solo existe con su flag encendido; la tienda sana es la
referencia contra la que se mide cada vulnerabilidad. Los límites conocidos del arnés están en
[docs/DEUDAS.md](docs/DEUDAS.md).

## Licencia

[MIT](LICENSE). Sin garantía de ningún tipo.
