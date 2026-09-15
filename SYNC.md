# Llama-dita — Registro de Sincronización y Estado de Agentes

Tablero de control y delimitación de trabajo compartido entre **Antigravity** y **Claude**.
Ambos agentes deben actualizar este archivo antes de comenzar una tarea y al finalizarla.

---

## 🔒 Zona de Trabajo Activa (Locks)

| Agente | Área (Y.Z) | Versión Objetivo | Archivos en Edición | Estado |
| :--- | :--- | :--- | :--- | :--- |
| *Ninguno* | - | - | - | *Libre para tomar tareas* |

> [!NOTE]
> Para tomar una tarea, reemplaza la fila anterior con tu nombre de agente, área, versión objetivo y los archivos que vas a intervenir. Al hacer el commit final, restaura el estado a *Libre*.

---

## 🗺️ Mapa de Áreas de Trabajo

| Código (Y) | Área | Archivos Principales | Descripción |
| :---: | :--- | :--- | :--- |
| **1** | Audio Core & DSP | `src/audio/audioManager.js` | Captura de micrófono, análisis PCM, decibelios, RMS y loopback. |
| **2** | Red, Señalización & WebRTC | `src/network/peerManager.js` | Canales Supabase Realtime, negociación WebRTC, ICE, TURN y DataChannel. |
| **3** | UI, Canvas & Estilos | `src/components/`, `src/style.css`, `index.html`, `src/main.js` | Interfaz dividida, vúmetros, espectro canvas, responsive y auras. |
| **4** | Desktop & Empaquetado | `desktop/`, `installer.iss`, `*.bat` | Configuración de Neutralinojs, WebView2, scripts de build e Inno Setup. |

---

## 📋 Historial de Cambios y Versiones

| Versión | Agente | Área | Resumen Técnico |
| :--- | :--- | :---: | :--- |
| `0.0.0.A` | Antigravity | 2.1 | Migración completa de señalización a Supabase Realtime y WebRTC nativo con relé TURN. Adopción del formato de versionado X.Y.Z.L. |

---

## ⚠️ Reglas Inquebrantables para Agentes
1. **Compilación Limpia**: Nunca hagas `git push` con la compilación rota (`npm run build` debe dar código 0).
2. **Respeto de Áreas**: No toques archivos del área del otro agente a menos que esté especificado en el lock de `SYNC.md`.
3. **Tono Profesional**: Mantén los mensajes de commit en formato técnico: `[X.Y.Z.L] Tipo: Descripción`.
4. **Rebase Obligatorio**: Ejecuta siempre `git pull --rebase origin main` antes de empezar para evitar bifurcaciones no deseadas.
