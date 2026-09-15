# Llama-dita — Protocolo de Desarrollo y Colaboración Multi-Agente (Claude & Antigravity)

Este proyecto es desarrollado en paralelo por dos agentes de IA:
- **Antigravity**
- **Claude**

Para evitar conflictos de git, pérdidas de código y solapamientos, **ambos agentes deben leer este archivo y SYNC.md obligatoriamente al inicio de cada turno.**

---

## 1. Esquema Obligatorio de Control de Versiones: Semantic Versioning (SemVer 2.0.0)

Se adopta formalmente el estándar **SemVer 2.0.0 (`MAJOR.MINOR.PATCH`)**:
- **MAJOR** (ej. `1.0.0` ➔ `2.0.0`): Cambios incompatibles de gran escala o reestructuraciones completas.
- **MINOR** (ej. `1.0.0` ➔ `1.1.0`): Nuevas funcionalidades retrocompatibles (ej. cuentas, amigos, canales, updater).
- **PATCH** (ej. `1.0.0` ➔ `1.0.1`): Correcciones de errores, fixes de red o parches sin alterar la API.

La versión vive en `package.json` como **fuente única de verdad** y se propaga automáticamente a `desktop/neutralino.config.json` e `installer.iss`.

Al realizar un commit, utilizar **Conventional Commits**:
- `feat:` Nuevas funcionalidades
- `fix:` Correcciones de bugs
- `refactor:` Refactorización sin cambios de comportamiento
- `chore:` Tareas de mantenimiento, dependencias o configuración

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
   - Mensaje de commit estándar: `tipo(alcance): descripción concisa` (ej. `feat: auto-updater`, `fix: stun/turn relay`)
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
