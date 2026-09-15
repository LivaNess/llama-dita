# 🎙️ Toki Podcast — Estudio de Audio en Tiempo Real

> Alternativa ultra ligera a Discord para transmisiones de voz 1 a 1 en tiempo real con medidores de intensidad y visualizadores de onda a 60 FPS.

[![Cloudflare Pages](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-f38020?logo=cloudflare)](https://toki-podcast.pages.dev)
[![RAM Usage](https://img.shields.io/badge/RAM%20Desktop-37.5%20MB-brightgreen)](#comparativa-de-rendimiento)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 🌐 Aplicación Web en Vivo
Entra directamente desde tu navegador sin instalar nada:
👉 **[https://toki-podcast.pages.dev](https://toki-podcast.pages.dev)**

---

## ✨ Características Principales

- **Pantalla Dividida (Split Screen / 2 Cabinas)**: Cabina local para ti y cabina remota para tu amigo.
- **Medidores de Intensidad de Audio en Tiempo Real**:
  - VU Meters analógico-digitales con lectura de decibelios (`dB`) y porcentaje (`%`) con retención de picos (*Peak Hold*).
  - Ecualizador gráfico de espectro de frecuencias en Canvas a 60 FPS.
  - Halo de voz reactivo (*Vocal Aura*) que se expande y brilla proporcionalmente al volumen de voz.
  - Indicador dinámico de estado (*Hablando* / *Silencio*).
- **Procesamiento de Audio de Hardware**:
  - Motor PCM directo (`ScriptProcessorNode`) con análisis de señal cada ~21 ms.
  - Control de sensibilidad y ganancia ajustable (50% a 350%).
  - Monitor de audio en bucle (*Probar audio*) para escucharte a ti mismo.
- **Conexión P2P Automática (WebRTC)**:
  - Sistema de salas inteligentes con asignación simétrica de Cabina A y Cabina B.
  - Generación de enlace de invitación con 1 solo clic.
  - Audio bidireccional de baja latencia con cancelación de eco y reducción de ruido.
- **Versión de Escritorio para Windows (.EXE)**:
  - Consumo de **~37 MB de RAM** frente a los más de **500 MB de Discord**.
  - Ejecutable portable de **2.49 MB** sin instalador pesado.

---

## 📊 Comparativa de Rendimiento vs Discord

| Característica | Discord (Electron) | Toki Podcast (.exe nativo) |
| :--- | :--- | :--- |
| **Memoria RAM** | **~500 MB a 1.200 MB** | **~37.5 MB** ⚡ *(15 a 20 veces menos)* |
| **Peso del programa** | ~150 MB instalador | **2.49 MB** portable |
| **Uso de CPU en reposo** | 2% – 8% | **0.0%** |
| **Arquitectura** | Chromium completo + Node.js | Windows Native WebView2 |

---

## 🚀 Cómo Colaborar y Desarrollar

### 1. Clonar el repositorio
```bash
git clone https://github.com/LivaNess/toki-podcast.git
cd toki-podcast
```

### 2. Instalar dependencias y correr en desarrollo
```bash
npm install
npm run dev
```
Abre `http://localhost:3000` en tu navegador.

### 3. Compilar versión web para producción
```bash
npm run build
```

### 4. Desplegar en Cloudflare Pages
```bash
npx wrangler pages deploy dist --project-name toki-podcast
```

### 5. Compilar versión de escritorio (.EXE)
```bash
cd desktop
npx @neutralinojs/neu build
```
El ejecutable se generará en `desktop/dist/TokiPodcast/TokiPodcast-win_x64.exe`.

---

## 🛠️ Tecnologías Utilizadas

- **Frontend**: HTML5, CSS3 Glassmorphism, JavaScript Moderno (ESModules).
- **Audio**: Web Audio API (MediaStream, GainNode, AnalyserNode, ScriptProcessor PCM engine).
- **Red P2P**: WebRTC, PeerJS Mesh, Google & Cloudflare STUN servers.
- **Desktop Runtime**: Neutralinojs + Windows WebView2.
- **Hosting**: Cloudflare Pages Edge Network.

---

## 📄 Licencia
Este proyecto es de código abierto bajo la licencia MIT.