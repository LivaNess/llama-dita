# Llama-dita

Aplicación de comunicación de voz punto a punto (P2P) de baja latencia con análisis de señales de audio en tiempo real y ejecución local en Windows.

## Descarga e Instalación

1. Descargar el instalador de Windows:
   - [Llama-dita-Setup.exe](installer/Llama-dita-Setup.exe)
2. Ejecutar el archivo de instalación.
3. La aplicación se instalará en el directorio local de usuario (`%LocalAppData%\Llama-dita`) y creará accesos directos en el Escritorio y el Menú Inicio.

## Características Técnicas

- **Conexión P2P directa**: Implementación sobre WebRTC con servidores STUN para negociación NAT simétrica.
- **Procesamiento de señal de audio (DSP)**: Procesamiento de muestras PCM a nivel de hardware (`ScriptProcessorNode`) con cálculo de RMS y pico en intervalos de ~21 ms.
- **Medición visual**: Visualizador en tiempo real a 60 FPS con VU meter calibrado en decibelios (dB) y análisis de espectro de frecuencias por FFT.
- **Bajo consumo de recursos**: Arquitectura basada en WebView2 nativo de Windows, con una huella de memoria promedio inferior a 40 MB de RAM y consumo de CPU nulo en estado de reposo.

## Estructura del Proyecto

```
├── desktop/           # Configuración y código fuente del cliente de escritorio
├── installer/         # Instalador ejecutable compilado (Llama-dita-Setup.exe)
├── src/               # Módulos centrales (DSP de audio, conexión WebRTC y componentes)
├── installer.iss      # Script de compilación de Inno Setup
├── crear-instalador.bat # Script de compilación automatizada del instalador
├── actualizar.bat     # Script de sincronización con repositorio remoto
├── index.html         # Interfaz de usuario
├── package.json       # Manifiesto de dependencias y scripts de Node.js
└── vite.config.js     # Configuración del empaquetador Vite
```

## Desarrollo y Compilación

### Requisitos previos
- Node.js (v18 o superior)
- Inno Setup 6 (para generar el instalador de Windows)

### Instalación de dependencias
```bash
npm install
```

### Ejecución en entorno de desarrollo
```bash
npm run dev
```

### Compilación de la aplicación
```bash
npm run build
```

### Generación del instalador de Windows
Ejecutar el script:
```cmd
crear-instalador.bat
```
El archivo de instalación resultante se generará en `installer/Llama-dita-Setup.exe`.

## Licencia

MIT License.