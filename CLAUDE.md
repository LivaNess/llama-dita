# Llama-dita — Protocolo de Desarrollo y Colaboración Multi-Agente (Claude & Antigravity)

Este proyecto es desarrollado en paralelo por dos agentes de IA:
- **Antigravity**
- **Claude**

Para evitar conflictos de git, pérdidas de código y solapamientos, **ambos agentes deben leer este archivo y SYNC.md obligatoriamente al inicio de cada turno.**

---

## 1. Esquema Obligatorio de Control de Versiones: `X.Y.Z.L`

Toda versión y commit debe respetar estrictamente la estructura:
- **X** (Versión Mayor): Cambios masivos o reestructuraciones completas del núcleo.
- **Y** (Área de Trabajo Activa):
  - `1`: Audio & Procesamiento DSP (`src/audio/`)
  - `2`: Red, Señalización Supabase & WebRTC (`src/network/`)
  - `3`: Interfaz de Usuario, Canvas Visualizers & Estilos (`src/components/`, `src/style.css`, `index.html`, `src/main.js`)
  - `4`: Empaquetado Desktop, Instalador Windows & Scripts (`desktop/`, `installer.iss`, `*.bat`)
- **Z** (Punto Específico): Identificador numérico de la función o subtarea dentro del área.
- **L** (Letra de Iteración / Fix): Contador alfabético del intento de corrección (`A` = primer intento, `B` = segundo intento, etc.).

Al publicar o commitear una versión, debe quedar actualizada en:
1. `package.json` (`version`)
2. `desktop/neutralino.config.json` (`version`)
3. `installer.iss` (`AppVersion`)
4. `index.html` y `desktop/resources/index.html` (`.logo-tag`)
5. `SYNC.md` (registro histórico)

---

## 2. Protocolo de Bloqueo y Coordinación (Lectura Obligatoria de `SYNC.md`)

Antes de realizar CUALQUIER edición en el código:

1. **Sincronizar el repositorio**:
   ```bash
   git pull --rebase origin main
   ```
2. **Revisar `SYNC.md`**:
   - Consultar la sección **"Zona de Trabajo Activa (Locks)"**.
   - Si el otro agente tiene bloqueada un área o archivo en curso, **NO modifiques esos archivos**. Trabaja en otra área disponible o espera a que finalice.
3. **Registrar tu tarea en `SYNC.md`**:
   - Modifica la tabla de locks con tu nombre de agente, área (`Y.Z`), archivos que vas a intervenir y la versión objetivo.
4. **Hacer cambios exclusivamente en el alcance delimitado**.
5. **Verificar compilación**:
   ```bash
   npm run build
   ```
   *(La compilación debe terminar con código de salida 0 sin errores)*.
6. **Actualizar `SYNC.md`**:
   - Liberar el lock activo (*Libre para tomar tareas*).
   - Agregar la nueva entrada en la tabla **"Historial de Cambios y Versiones"**.
7. **Commit y Push**:
   - Mensaje de commit estándar: `[X.Y.Z.L] Tipo: Descripción concisa y profesional`
   - Ejecutar `git push origin main`.

---

## 3. Pila Tecnológica y Arquitectura
- **Frontend Web**: Vanilla JavaScript modular (ESM), HTML5 Canvas para visualizadores de audio en tiempo real (60 FPS), Vite como empaquetador.
- **Motor de Audio**: Web Audio API (`AudioContext`, `AnalyserNode`, direct PCM RMS / peak meters en dB y %).
- **Red & P2P**:
  - **Señalización**: Supabase Realtime (Broadcast y Presence) conectado al proyecto `LLAMA DITA` (`mwzkrahindnheuheoycv`).
  - **Transporte de Audio**: `RTCPeerConnection` nativo con servidores STUN (Google, Cloudflare) y servidores TURN de retransmisión (OpenRelay Metered en puertos 80/443 TCP y UDP).
  - **Canal de Datos**: WebRTC `DataChannel` para metadatos (nombre, mute, estado de ping).
- **Cliente Windows**: Neutralinojs v6 + WebView2 (~37 MB de consumo RAM).
- **Instalador Windows**: Inno Setup 6 generando `installer/Llama-dita-Setup.exe`.
