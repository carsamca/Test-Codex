# Voice Sales Agent

Prototipo recuperado y auditado. **No está listo para producción ni validado de extremo a extremo con voz real.**

La rama de validación compila y permite probar chat con respuestas fijas, STT en modalidad texto y herramientas simuladas. Audio STT devuelve 501; sin clave, TTS indica fallback al navegador.

## Prueba automatizada sin credenciales

Probado con Node 24.19.0:

```sh
cd backend
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

El arnés elimina claves del entorno, intercepta peticiones a proveedores y usa exclusivamente datos sintéticos y HTTP local. Los archivos de herramientas se crean temporalmente y se eliminan al finalizar. La prueba del widget usa jsdom y APIs de voz simuladas, no micrófono.

## Demo manual local

En una terminal:

```sh
cd backend
npm run build
env -u OPENAI_API_KEY npm start
```

En otra:

```sh
cd frontend
python -m http.server 4173 --bind 127.0.0.1
```

Abrir http://localhost:4173. El widget apunta a http://localhost:3001. Usar texto para la demo; escuchar/reproducir depende del navegador y no se ha verificado en esta auditoría. El servidor ordinario no está limitado a loopback: usar solo un entorno local aislado. No introducir datos reales.

`FORCE_LANGUAGE=es|en|fr|pt` fuerza el idioma del backend. Sin proveedor, el chat solo pregunta el nombre repetidamente; no ejecuta un proceso comercial inteligente. Los endpoints son POST /api/stt, /api/chat y /api/tts; /health es auxiliar.

Detalles, errores reproducibles, pruebas y pendientes: [audit/VALIDACION.md](audit/VALIDACION.md).
