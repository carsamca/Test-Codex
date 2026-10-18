# Voice Sales Agent — validación aislada, 18 de octubre de 2026

## Dictamen

La implementación recuperada **no compila** y **no acredita un agente comercial de voz funcional de extremo a extremo**. Se recuperó el commit `3b150b8c00041537d176278d6b3c004265753946` de `carsamca/Test-Codex`, rama `codex/build-multilingual-voice-sales-agent` (16 archivos). PR #1 continúa abierta, sin fusionar. Su comentario previo sobre duplicación del usuario se confirmó.

Las correcciones están exclusivamente en `codex/validate-voice-sales-agent-2026-10-18`. No se modificó la rama recuperada, no se desplegó, no se usaron claves reales, audio real ni datos personales. Esto es una auditoría con reparaciones acotadas, no una entrega completa del producto.

## Entorno y método

- Linux, Node 24.19.0, npm 11.9.0, TypeScript 5.9.3. La rama original carecía de lockfile; la prueba usa las versiones que resolvió npm en esta fecha, no presume las de enero.
- Express 4.22.3, cors 2.8.6, express-rate-limit 7.5.1. Se añadió lockfile, @types/cors 2.8.19 y jsdom 30.1.3 para pruebas DOM.
- Instalación con `npm install --ignore-scripts --no-audit --no-fund`. Código de aplicación probado en proceso separado, HTTP enlazado por el arnés exclusivamente a 127.0.0.1 y puerto efímero; herramientas escriben en directorio temporal y se elimina al terminar.
- OPENAI_API_KEY y FORCE_LANGUAGE se eliminan al comenzar. Para activar rutas del proveedor se usa una cadena ficticia y se intercepta fetch: no salen peticiones a proveedores. Las respuestas y fallos del proveedor son simulaciones, no pruebas de aceptación de la API real.
- Compilación original: salida 2, TS7016 por tipos de cors ausentes y TS2345 en despacho de herramientas. TypeScript emitió JavaScript pese al error (noEmitOnError no está activo); ese JavaScript permitió diagnosticar el runtime sin afirmar compilación satisfactoria.
- Resultado original: 50 comprobaciones básicas aprobadas, con defectos registrados en `baseline.json`; aprobar comprobaciones del comportamiento observado no significa cumplir requisitos.
- Resultado corregido: compilación salida 0, 72 comprobaciones del backend aprobadas, prueba DOM del widget aprobada, comprobación sintáctica JS y `git diff --check` satisfactorias.

## Cobertura y resultados

| Área | Evidencia original | Corrección o límite actual |
| --- | --- | --- |
| POST /api/stt, texto | Recorta texto, detecta idioma; 200 | Se conserva modalidad texto. No transcribe audio. |
| POST /api/stt, audio | `{audioBase64:"UklGRg=="}` devuelve 200, texto vacío | Devuelve 501 explícito; sin entrada, 400. El TODO de transcripción sigue pendiente. No se afirma prueba de audio válido. |
| POST /api/chat sin clave | 200, frase fija por idioma, actions vacías | Sigue siendo fallback sin inteligencia comercial. Ahora pregunta solo el nombre. |
| POST /api/tts sin clave | 200, provider stub, audioBase64 null | Sin generación de audio; navegador debe hacer speechSynthesis. |
| Idiomas | hola/en hello/bonjour/obrigado funcionan; Olá→es, orçamento→fr, você→fr, “I have a budget”→fr | Estos casos pasan tras corregir heurística. Sigue siendo una heurística limitada, no detección general ni prueba de conversación multilingüe. |
| Idioma forzado | FORCE_LANGUAGE es/en/fr/pt prevalece sobre hint | Probado para los cuatro. Los hints regionales es-ES, en-US, fr-FR, pt-BR se normalizan en la corrección. |
| Sesiones | IDs distintos separan transcripciones; roles, idioma, timestamps ISO presentes | En memoria; sin persistencia, TTL, autenticación ni vinculación de ID a usuario. Conocer un ID permite reutilizarlo. |
| Duplicaciones | STT+chat guarda dos entradas de usuario; LLM añade otra copia al prompt | STT ya no escribe historial; chat es propietario del turno; LLM usa historial ya preparado. |
| Concurrencia | Dos turnos solapados pierden el segundo al terminar el primero; reproducido en before-session-lock.json | Segundo turno simultáneo recibe 409; tras terminar el primero el reintento funciona y conserva 4 entradas. No hay cola distribuida. |
| Validaciones | Falta de campos da 400; texto numérico da 500 con detalle interno; espacios se aceptan | Tipos y texto vacío producen 400; se ocultan detalles internos; errores de parser 400/413 preservados por código. No se afirma cobertura exhaustiva de parser/5MB. |
| Rate limiting | Después del límite de 120 solicitudes/minuto se obtiene 429 | Verificado también tras cambios. No se probó expiración de ventana, proxy ni múltiples instancias. |
| Herramientas | Argumentos JSON-string se guardan como strings; buscarFAQ falla por query indefinido | Parseo y validación de campos, despacho tipado. Cuatro stubs producen salidas/JSONL; argumentos malformados rechazados. |
| Error LLM | Tres respuestas 500 se convierten silenciosamente en fallback | Ahora se informa error; se prueban 3 intentos. AbortController probado con reloj acelerado para el temporizador de 10s. |
| TTS con proveedor simulado | Bytes ficticios se convierten a base64 | No acredita MP3 válido. Se corrige format→response_format según contrato oficial. |
| Widget | DOM emulado abre/cierra y envía texto; un input con img crea un elemento HTML | textContent evita interpretar HTML. No se afirma ejecución de un exploit real. |

## STT del navegador frente al servidor

El widget usa SpeechRecognition/webkitSpeechRecognition. Configura el reconocedor con `navigator.language`; una prueba simulada pt-BR confirma ese valor. El navegador produce una transcripción y el widget manda **texto**, no audio, a `/api/stt`; después lo manda a `/api/chat`. El endpoint STT no es el motor que escucha en este flujo. No hay MediaRecorder ni subida de audio ni implementación Whisper en el código recuperado.

Por tanto, que el widget pueda funcionar con un reconocedor disponible no demostraría transcripción en el servidor. Tampoco se debe suponer que SpeechRecognition opera localmente o sin servicios del navegador. No se probaron permisos de micrófono, soporte por navegador, privacidad del proveedor de reconocimiento, audio o calidad lingüística.

Después del chat, el widget solicita TTS al backend; si no recibe audio, llama a speechSynthesis. En jsdom se verificó esa secuencia con ambas APIs de voz simuladas. Se intentó Chromium/Playwright, pero faltaba el ejecutable y la descarga falló con un archivo inválido. No se ejecutó navegador real ni inspección visual.

## Qué hacen las herramientas

- guardarLead: añade un registro JSONL. No existe CRM real ni captura autónoma validada.
- agendarCita: añade una solicitud a appointments.jsonl. **No reserva una cita**.
- transferirHumano: añade un registro a handoffs.jsonl. **No conecta con una persona**.
- buscarFAQ: consulta dos entradas estáticas en inglés y registra la consulta. Ignora el idioma solicitado. La respuesta “Typical onboarding takes a few days” es contenido no aprobado y debe retirarse o sustituirse por catálogo autorizado.

El despacho funciona con llamadas de herramientas simuladas tras la corrección, pero el backend **no envía function_call_output al modelo ni solicita una respuesta posterior**. El resultado FAQ no informa la contestación final. Sigue pendiente el ciclo de function calling con límite de iteraciones, manejo de errores e idempotencia.

## Correcciones realizadas

1. Tipos cors y despacho tipado de herramientas con parseo JSON y campos requeridos.
2. Eliminación de las dos duplicaciones del turno de usuario.
3. STT audio no implementado devuelve error explícito; validación de entradas y mensajes de error externos sin detalles internos.
4. Correcciones acotadas de detección de idiomas y hints regionales; pregunta única en fallback.
5. Errores HTTP LLM dejan de pasar por respuestas satisfactorias.
6. Protección frente a turnos concurrentes del mismo ID (409).
7. Renderizado de texto seguro en widget y nombre correcto del parámetro de formato TTS.
8. Lockfile, gitignore, arneses y evidencia reproducible.

## Pendiente para cumplir la especificación

- Implementar proveedor STT de audio o aprobar expresamente modalidad exclusiva de navegador/texto, con límites de soporte visibles.
- Completar ciclo de herramientas con el modelo y comprobar contratos reales de esquemas y API. No se validaron cuentas, modelos disponibles, cuotas ni respuestas reales.
- Validar conversación real es/en/fr/pt: recuerdo de contexto, objeciones, una pregunta cada vez, captura progresiva y cierre; un prompt no acredita estas conductas. El fallback sigue repitiendo la misma pregunta.
- FAQ y catálogo autorizados, multilingües, sin plazos/precios inventados. Los prompts incluyen prohibición de inventar precios, pero no se evaluó un modelo real.
- TTS: timeouts/reintentos, selección de voz/locale configurable y reproducción real. Actualmente las cuatro configuraciones usan alloy; el endpoint no acepta voice explícita.
- Widget integrable: apiBase sigue fijo en http://localhost:3001, CSS afecta página global, no hay loader encapsulado. Faltan manejo de respuestas HTTP fallidas, bloqueo/reintento de envío, comunicación de 409, fallback accesible, HTTPS y prueba en páginas anfitrionas reales.
- Sesiones: TTL/límites de memoria, política de conservación, control de acceso y concurrencia multiinstancia. El arreglo usa memoria de un solo proceso.
- Red: TTS no tiene timeout/reintentos; el temporizador LLM se cancela al recibir cabeceras, por lo que no limita lectura posterior del cuerpo; backoff es lineal (500/1000ms), no exponencial, y reintenta también 4xx.
- Seguridad operativa: CORS abierto, ausencia de autenticación, límites por campo y configuración de bind/orígenes para uso real. Logs originales exponían mensajes internos. El código no persiste audio crudo; los tests no usaron audio real. Leads y herramientas sí escriben archivos y necesitan política de privacidad antes de uso real.

## Reproducción

En esta rama, con Node 24:

```sh
cd backend
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

`npm test` compila, prueba HTTP local con proveedor simulado y ejecuta el widget en jsdom. No hace peticiones a OpenAI ni usa credenciales del entorno. Para repetir original, crear worktree en el commit fuente, instalar sus dependencias y ejecutar build (fallará con los dos errores); ejecutar el arnés de esta rama sin --fixed y con VOICE_AUDIT_DIST apuntando al dist original. Para la prueba DOM original: `node backend/test/widget.mjs --baseline` desde la raíz de esta rama.

Evidencias: baseline-build.log, corrected-build.log, baseline.json, corrected.json, before-session-lock.json, widget-baseline.json y widget-corrected.json. Los números de comprobaciones se refieren a aserciones del arnés, no a requisitos completados. El arnés tiene un entorno seguro de pruebas; `npm start` ordinario no incorpora su interceptación de red.

## Fuentes

- PR: https://github.com/carsamca/Test-Codex/pull/1
- Código fuente: https://github.com/carsamca/Test-Codex/tree/3b150b8c00041537d176278d6b3c004265753946
- Especificación: https://app.notion.com/p/3efb188dea4881d6a605fe4fed15bf20
- Validación: https://app.notion.com/p/3efb188dea4881fd8152e96978097c40
- Contrato de herramientas (argumentos JSON-string y devolución function_call_output): https://developers.openai.com/api/docs/guides/function-calling
- Contrato TTS (response_format): https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create

La documentación de API fundamenta el contraste de contratos; no sustituye una prueba con proveedor real.
