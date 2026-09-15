# 🎙️ Toki Podcast — Estudio de Audio para Windows

> Alternativa ultra liviana a Discord para transmisiones de voz 1 a 1 en tiempo real con medidores de intensidad y visualizadores de onda a 60 FPS. Se instala directamente en Windows como una aplicación nativa.

[![Descargar Instalador](https://img.shields.io/badge/Descargar-TokiPodcast--Setup.exe-7c3aed?style=for-the-badge&logo=windows&logoColor=white)](installer/TokiPodcast-Setup.exe)
[![RAM Usage](https://img.shields.io/badge/RAM%20Desktop-37.5%20MB-brightgreen?style=for-the-badge)](#-comparativa-de-rendimiento-vs-discord)
[![Versión Web](https://img.shields.io/badge/Web%20Online-toki--podcast.pages.dev-f38020?style=for-the-badge&logo=cloudflare)](https://toki-podcast.pages.dev)

---

## 📥 Instalación en Windows (Estilo Discord)

No necesitas usar navegadores ni abrir pestañas de Chrome:
1. Descarga el instalador oficial:  
   👉 **[Descargar TokiPodcast-Setup.exe](https://github.com/LivaNess/toki-podcast/raw/main/installer/TokiPodcast-Setup.exe)** *(solo 3.0 MB)*.
2. Ejecuta el archivo con doble clic.
3. Se instalará automáticamente en tu equipo (`%LocalAppData%\TokiPodcast`), creará accesos directos en el **Escritorio** y en el **Menú Inicio**, y se abrirá al terminar.

---

## 📊 Comparativa de Rendimiento vs Discord

| Característica | Discord (Electron) | Toki Podcast (Nativo Windows) |
| :--- | :--- | :--- |
| **Memoria RAM** | **~500 MB a 1.200 MB** | **~37.5 MB** ⚡ *(15 a 20 veces menos)* |
| **Tamaño del instalador** | ~150 MB | **3.04 MB** |
| **Uso de CPU en reposo** | 2% – 8% | **0.0%** |
| **Inicio y carga** | Pesado, múltiples procesos | Instantáneo |
| **Arquitectura** | Chromium completo + Node.js | Windows Native WebView2 |

---

## ✨ Características Principales

- **Pantalla Dividida (Split Screen / 2 Cabinas)**: Cabina local para ti y cabina remota para tu amigo.
- **Medidores de Intensidad de Audio en Tiempo Real**:
  - VU Meters analógico-digitales con lectura de decibelios (`dB`) y porcentaje (`%`) con retención de picos (*Peak Hold*).
  - Ecualizador gráfico de espectro de frecuencias en Canvas a 60 FPS.
  - Halo de voz reactivo (*Vocal Aura*) que se expande y brilla en tiempo real con la voz.
  - Indicador dinámico de estado (*Hablando* / *Silencio*).
- **Procesamiento de Audio de Hardware**:
  - Motor PCM directo (`ScriptProcessorNode`) con lectura de muestras cada ~21 ms.
  - Control de sensibilidad y ganancia ajustable (50% a 350%).
  - Monitor de audio en bucle (*Probar audio*) para escucharte a ti mismo.
- **Conexión P2P Automática (WebRTC)**:
  - Sistema de salas inteligentes con asignación simétrica de Cabina A y Cabina B.
  - Generación de enlace de invitación con 1 solo clic.
  - Audio bidireccional de baja latencia con cancelación de eco y reducción de ruido.

---

## 🛠️ Estructura del Repositorio

```
toki-podcast/
├── installer/             # Instalador oficial para Windows (TokiPodcast-Setup.exe)
├── desktop/               # Código fuente del cliente de escritorio
├── src/                   # Código de la aplicación (Audio PCM, Canvas, WebRTC)
├── installer.iss          # Script de configuración de Inno Setup
├── crear-instalador.bat   # Script de 1 clic para compilar un nuevo instalador
├── actualizar.bat         # Script de 1 clic para hacer git pull y compilar
└── package.json
```

---

## 🚀 Cómo Desarrollar y Recompilar

### 1. Clonar el repositorio
```bash
git clone https://github.com/LivaNess/toki-podcast.git
cd toki-podcast
```

### 2. Ejecutar en desarrollo
```bash
npm install
npm run dev
```

### 3. Generar un nuevo instalador de Windows (.exe)
Haz doble clic en `crear-instalador.bat` o ejecuta:
```bash
npm run build
cd desktop && npx @neutralinojs/neu build && cd ..
"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" installer.iss
```
El nuevo instalador se generará en `installer/TokiPodcast-Setup.exe`.

---

## 📄 Licencia
Este proyecto es de código abierto bajo la licencia MIT.