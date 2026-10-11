# Ficha API4 — Consumo sin límite en el catálogo

> App vulnerable a propósito — solo laboratorio (127.0.0.1). Datos 100 % ficticios.
> Categoría OWASP: **API4:2023 Unrestricted Resource Consumption**. Flag: `VULN_API4=on|off`.
> Módulo: `api/src/vulns/api4.ts` · Spec: `specs/API4-consumo-sin-limite.md`.

## Qué es
El catálogo público (`GET /api/v2/relics`) acepta `?limit=` y `?offset=`. Con `VULN_API4=on` el
`limit` no tiene máximo y, sin él, la respuesta trae **todo** el catálogo. Quien llama decide cuánto
trabajo hace el servidor: una petición con `?limit=1000000` arma y envía todo lo que exista, y unas
pocas en paralelo agotan CPU, memoria o ancho de banda. No hace falta romper nada: es uso legítimo
de la API llevado al extremo.

## Por qué ocurre
Paginar «funciona» sin tope, y con un catálogo chico en desarrollo nadie nota el costo. El tamaño de
página es un parámetro más del cliente, y confiar en él es confiar en quien paga cero por pedir
mucho. Lo mismo vale para lo que no es una lista: tamaño de subidas, número de operaciones por
petición, llamadas a terceros que cuestan plata (SMS, correos), consultas costosas sin timeout.

## La corrección (`VULN_API4=off`)
`limit` va de 1 a 100 (sin `limit` rige 100) y un valor mayor responde **400** `BAD_REQUEST`; el
cliente recorre el resto con `offset`. El tope lo impone el servidor y es parte del contrato de la
API. El único `if (flags.API4)` vive en `api/src/vulns/api4.ts`. Fuera de alcance: límite de tasa
por IP o cliente, cuotas, timeouts, total y enlaces de paginación.

## Cómo practicarlo (herramienta de práctica)
Con la API del lab corriendo en local (el catálogo semilla es chico: crea reliquias con la admin
por `POST /api/v2/admin/relics`, o usa el check, que crea 105):

1. Con `VULN_API4=on`, pide `/api/v2/relics?limit=1000000` desde **Burp Repeater** y mira el tamaño
   y el tiempo de la respuesta. Con **Intruder** o `ab`/`hey` en paralelo, mide cómo crece la carga.
2. Reinicia con `VULN_API4=off` y repite: 400 de inmediato. Prueba `?limit=100&offset=100` para
   recorrer el catálogo por tramos.
3. Calibración del arnés (`exploits/test_api4.py`): con 105 reliquias, `limit=100` da 100 ítems en
   ambos modos (control) y `limit=1000000` entrega más de 100 en `on` y 400 en `off`.
