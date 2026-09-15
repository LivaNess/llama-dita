# Llama-dita — Registro de sincronización y estado de agentes

Tablero de control compartido entre **Antigravity** (Juan) y **Claude** (Martín).
Ambos agentes lo actualizan antes de empezar una tarea y al terminarla. El versionado está definido en `VERSIONADO.md`.

---

## 🔒 Zona de trabajo activa (locks)

| Agente | Versión objetivo | Archivos en edición | Estado |
| :--- | :--- | :--- | :--- |
| *Ninguno* | - | - | *Libre para tomar tareas* |

> Para tomar una tarea, reemplazá la fila con tu agente, la versión objetivo y los archivos que vas a intervenir. Al hacer el commit final, restaurá el estado a *Libre*.

---

## 📋 Historial de cambios y versiones

Cronológico. Acá se lee qué significa cada área y foco (el número no es un mapa fijo).

| Versión | Agente | Área / foco | Resumen |
| :--- | :--- | :--- | :--- |
| `1.1.1A` | Antigravity | Base P2P | Llamada de voz P2P, señalización migrada a Supabase Realtime, WebRTC nativo con relé TURN, cliente Windows. (Versión asignada retroactivamente: reemplaza `0.0.0.A` y `1.0.1`, esquemas anteriores obsoletos.) |
| `1.2.1A` | Claude | Cuentas / amigos y canales | Login sin contraseña (código o enlace por mail), perfil, amigos con presencia, llamada directa con timbre, canales de texto (chat en vivo) y de voz con código de invitación. Esquema SQL con RLS en `supabase/migrations/`. Panel aditivo en `src/social/`. |
| `1.3.1A` | Claude | Actualizaciones / updater | Al abrir busca versión nueva (aviso opcional, casilla "actualizar sola"). Tag de versión del header abre "Buscar actualizaciones". Escritorio: updater nativo de Neutralino desde `desktop/update-manifest.json` + `resources.neu` en el repo. `scripts/build-desktop.mjs` sincroniza versión y empaqueta. |
| `1.3.1B` | Claude | Actualizaciones / updater | El aviso de versión nueva muestra también la versión instalada. Primera actualización real publicada para probar el updater en la app instalada. |
| `1.4.1A` | Claude | Onboarding de cuenta | Al abrir sin sesión se abre solo el panel "Creá tu cuenta" (mail → código o enlace). El mail queda como identidad del usuario; el perfil se crea solo. Botón del header dice "Crear cuenta" hasta que entrás. |
| `1.5.1A` | Claude | Escritorio / updater y permisos | Fix updater: el WebView cacheaba el manifiesto (cache-busting) y faltaba el permiso `filesystem.writeBinaryFile` para instalar. Puerto fijo 24024 + `webviewArgs` para que WebView2 no pida el micrófono en cada apertura. |
| `1.5.1B` | Claude | Escritorio / updater | "Estás al día" muestra la versión. Versión publicada para probar el updater arreglado desde 1.5.1A. |
| `1.5.2A` | Claude | Escritorio / fuente del updater | raw.githubusercontent tiene varios cachés y llegó a ofrecer una versión vieja. El updater ahora lee manifiesto y resources.neu desde la API de GitHub (Accept raw, sin caché) e instala con filesystem.writeBinaryFile + restartProcess. |
| `1.5.2B` | Claude | Escritorio / fuente del updater | Versión publicada para probar la actualización completa desde 1.5.2A (descarga + reinicio). |
| `1.5.2C` | Claude | Escritorio / fuente del updater | Fix: el aviso de actualización quedaba debajo de la capa del panel de cuenta (no se podía clickear). Click afuera y botón ✕ cierran el panel de login. |
| `1.5.2D` | Claude | Escritorio / fuente del updater | Versión publicada para que Martín pruebe la actualización desde 1.5.2C. |
| `1.6.1A` | Claude | Acceso / crear cuenta vs iniciar sesión | Pestañas "Crear cuenta" / "Ya tengo cuenta" (esta última no crea usuarios: avisa si el mail no existe). Copy claro: el mail trae un enlace, hay que pegarlo en la app. |

---

## ⚠️ Reglas para agentes
1. **Build limpio**: nunca `git push` con `npm run build` roto.
2. **Respetar locks**: no tocar archivos que el otro agente tiene bloqueados.
3. **Versión en un solo lugar**: `package.json`. Commit `[H.A.F+letra] tipo: descripción`. Nunca subir el Hito sin permiso.
4. **Rebase antes de empezar**: `git pull --rebase origin main`.
5. **Sin menciones a otras apps de chat/voz** en ningún lado.

---

## 📌 Pendientes conocidos
- SMTP propio en Supabase (con el mail por defecto del plan gratis: 2 mails/hora y plantilla no editable, así que hoy el mail trae solo el enlace).
- Regenerar `installer/Llama-dita-Setup.exe` con `crear-instalador.bat` (Inno Setup) para instalaciones nuevas en `1.3.1A`.
- La señalización (`src/network/peerManager.js`) crea su propio cliente Supabase; conviene que use `src/supabase/client.js` para no duplicar sesiones.
- Al conectar por llamada directa, la cabina remota a veces muestra "Participante" en vez del nombre (el mensaje `profile` por DataChannel puede llegar antes de que el otro esté listo).
