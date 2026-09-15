# Llama-dita

AplicaciÃ³n de comunicaciÃ³n de voz punto a punto (P2P) de baja latencia con anÃ¡lisis de seÃ±ales de audio en tiempo real y ejecuciÃ³n local en Windows.

## Descarga e InstalaciÃ³n

1. Descargar el instalador de Windows:
   - [Llama-dita-Setup.exe](installer/Llama-dita-Setup.exe)
2. Ejecutar el archivo de instalaciÃ³n.
3. La aplicaciÃ³n se instalarÃ¡ en el directorio local de usuario (`%LocalAppData%\Llama-dita`) y crearÃ¡ accesos directos en el Escritorio y el MenÃº Inicio.

## CaracterÃ­sticas TÃ©cnicas

- **ConexiÃ³n P2P directa**: ImplementaciÃ³n sobre WebRTC con servidores STUN para negociaciÃ³n NAT simÃ©trica.
- **Procesamiento de seÃ±al de audio (DSP)**: Procesamiento de muestras PCM a nivel de hardware (`ScriptProcessorNode`) con cÃ¡lculo de RMS y pico en intervalos de ~21 ms.
- **MediciÃ³n visual**: Visualizador en tiempo real a 60 FPS con VU meter calibrado en decibelios (dB) y anÃ¡lisis de espectro de frecuencias por FFT.
- **Bajo consumo de recursos**: Arquitectura basada en WebView2 nativo de Windows, con una huella de memoria promedio inferior a 40 MB de RAM y consumo de CPU nulo en estado de reposo.

## Estructura del Proyecto

```
â”œâ”€â”€ desktop/           # ConfiguraciÃ³n y cÃ³digo fuente del cliente de escritorio
â”œâ”€â”€ installer/         # Instalador ejecutable compilado (Llama-dita-Setup.exe)
â”œâ”€â”€ src/               # MÃ³dulos centrales (DSP de audio, conexiÃ³n WebRTC y componentes)
â”œâ”€â”€ installer.iss      # Script de compilaciÃ³n de Inno Setup
â”œâ”€â”€ crear-instalador.bat # Script de compilaciÃ³n automatizada del instalador
â”œâ”€â”€ actualizar.bat     # Script de sincronizaciÃ³n con repositorio remoto
â”œâ”€â”€ index.html         # Interfaz de usuario
â”œâ”€â”€ package.json       # Manifiesto de dependencias y scripts de Node.js
â””â”€â”€ vite.config.js     # ConfiguraciÃ³n del empaquetador Vite
```

## Desarrollo y CompilaciÃ³n

### Requisitos previos
- Node.js (v18 o superior)
- Inno Setup 6 (para generar el instalador de Windows)

### InstalaciÃ³n de dependencias
```bash
npm install
```

### EjecuciÃ³n en entorno de desarrollo
```bash
npm run dev
```

### CompilaciÃ³n de la aplicaciÃ³n
```bash
npm run build
```

### GeneraciÃ³n del instalador de Windows
Ejecutar el script:
```cmd
crear-instalador.bat
```
El archivo de instalaciÃ³n resultante se generarÃ¡ en `installer/Llama-dita-Setup.exe`.

## Licencia

MIT License.