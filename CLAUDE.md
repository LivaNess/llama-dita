# Llama-dita — Protocolo de desarrollo y colaboración multi-agente (Claude & Antigravity)

Este proyecto lo desarrollan en paralelo dos personas con sus agentes de IA:
- **Juan (LivaNess)** con **Antigravity**
- **Martín (Mreboredo)** con **Claude**

Para evitar conflictos de git, pérdida de código y solapamientos, **ambos agentes leen este archivo, `SYNC.md` y `VERSIONADO.md` al inicio de cada turno.**

**Los cuatro documentos y para qué sirve cada uno:**

| Documento | Para qué |
|---|---|
| `CLAUDE.md` | cómo trabajamos: versionado, locks, reglas |
| `ESQUELETO.md` | qué es cada parte, dónde vive y con qué se conecta |
| `SYNC.md` | quién está tocando qué **ahora** |
| `CAMBIOS.md` | qué se hizo en cada versión y cómo verificarlo |

**Dos obligaciones al terminar una tarea:** si creaste un área nueva, se registra en
`ESQUELETO.md` con sus conexiones; si publicaste una versión, se registra en `CAMBIOS.md`.
Sin eso, la tarea no está terminada.

---

## 1. Versionado: `HITO.ÁREA.FOCO` + letra · ej. `1.3.1A`

Definido completo en **`VERSIONADO.md`** (leerlo). Resumen:

- **Hito** sube solo con permiso de Martín o Juan. **Área** sube al cambiar de área de trabajo. **Foco** sube al cambiar de cosa puntual dentro del área. **Letra** sube en cada commit sobre el mismo foco.
- No es semver ni un mapa fijo de áreas: es cronológico. Qué significa cada número se lee en el historial de `SYNC.md`.
- La versión vive **solo en `package.json`**. La UI la toma del build; `npm run build:desktop` la copia a `desktop/neutralino.config.json` e `installer.iss` y escribe el manifiesto de actualización. No editar esos a mano.
- Formato de commit: `[1.3.1B] tipo: descripción corta` (tipos: feat, fix, docs, chore, refactor).

---

## 2. Protocolo de coordinación (`SYNC.md`)

Antes de editar código:

1. **Sincronizar**: `git pull --rebase origin main`.
2. **Revisar `SYNC.md`** → "Zona de trabajo activa (locks)". Si el otro agente tiene bloqueados archivos, no tocarlos: trabajar en otra cosa o esperar.
3. **Registrar la tarea** en la tabla de locks: agente, versión objetivo, archivos que se van a intervenir.
4. **Cambiar solo lo delimitado.** Si hace falta tocar algo fuera del lock, ampliarlo en `SYNC.md` primero.
5. **Verificar**: `npm run build` (salida 0, sin errores). Si se tocó algo del escritorio o se publica versión: `npm run build:desktop`.
6. **Actualizar `SYNC.md`**: liberar el lock y agregar la fila en "Historial".
7. **Commit y push** a `main`: `[versión] tipo: descripción`.

Reglas:
- Nunca pushear con el build roto.
- Nunca subir el Hito sin permiso explícito.
- **Cero menciones a otras apps de chat/voz** en código, UI, docs o commits. Llama-dita se describe por lo que es.
- Antes de reinventar algo, mirar si ya existe: `src/supabase/client.js` es el cliente Supabase compartido (auth, datos, presencia). No crear clientes nuevos con `createClient`: cada uno abre una conexión en vivo más por usuario. La señalización (`peerManager.js`) también lo usa desde la `1.12.1A`.
- **Escala objetivo: 50 a 100 usuarios en el plan gratis de Supabase.** Nada que escriba en la base de forma periódica ni que emita en vivo cambios de una tabla que todos escuchan. Presencia = Realtime Presence (canal `presencia`).

---

## 3. Pila tecnológica y arquitectura

- **Frontend web**: JavaScript vanilla modular (ESM), HTML5 Canvas para visualizadores de audio a 60 FPS, Vite.
- **Motor de audio**: Web Audio API (`AudioContext`, `AnalyserNode`, RMS/pico en dB y %).
- **Red y P2P**: señalización por Supabase Realtime (Broadcast y Presence); transporte `RTCPeerConnection` con STUN (Google, Cloudflare) y TURN (OpenRelay Metered 80/443 TCP y UDP); `DataChannel` para metadatos.
- **Backend**: Supabase, proyecto `LLAMA DITA` (`mwzkrahindnheuheoycv`). Auth sin contraseña (código o enlace por mail). Tablas con RLS: `profiles`, `friendships`, `channels`, `channel_members`, `messages`, `call_invites`. Esquema en `supabase/migrations/`. Las claves de `src/supabase/client.js` son públicas por diseño; lo que protege es RLS.
- **Panel social** (`src/social/`): perfil, amigos, canales de texto (chat en vivo) y de voz, llamada directa con timbre. Aditivo a la sala P2P.
- **Actualizaciones** (`src/updater.js`): al abrir consulta `https://llamadita.com.ar/update-manifest.json` y baja `https://llamadita.com.ar/descargas/resources.neu`. Si el dominio no responde, cae a la API de GitHub con el mismo contenido del repo. **Publicar una versión** = subir `package.json` → `npm run build:desktop` → `npm run deploy:web` → commit y push a `main`. Sin el deploy de la web, las apps instaladas no ven la versión nueva.
- **Web oficial** (`web/`): sitio estático en `llamadita.com.ar` (Cloudflare Pages, proyecto `llamadita`). Presenta la app, ofrece el instalador en `/descargas/` y permite crear cuenta con el mismo Supabase. Se arma con `npm run build:web` (sale en `site-dist/`, que no se versiona) y se publica con `npm run deploy:web`.
- **Identidad visual**: logo en `public/brand/` (`logo-mark-light.svg` para fondo oscuro, `logo-mark-navy.svg` para fondo claro) y `public/favicon.svg`. Los colores y la tipografía de marca viven en `src/brand.css`, que se carga **después** de `style.css` y solo pisa colores y detalles: el layout se sigue tocando en `style.css`.
- **Cliente Windows**: Neutralino v6 + WebView2. **Instalador**: Inno Setup 6 → `installer/Llama-dita-Setup.exe` (solo hace falta para instalaciones nuevas).

---

## 4. Mapa de carpetas

```
src/audio/           captura y análisis de audio
src/network/         señalización y WebRTC
src/components/      visualizadores canvas
src/social/          cuentas, amigos, canales, llamadas directas
src/supabase/        cliente Supabase compartido
src/updater.js       actualizaciones
supabase/migrations/ esquema SQL del backend
scripts/             build-desktop.mjs (empaquetado + manifiesto)
desktop/             Neutralino (config, resources, update-manifest.json, dist/…/resources.neu)
installer.iss        Inno Setup
```
