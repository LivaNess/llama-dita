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

## Cuentas, amigos y canales

Además de la sala de voz P2P, la app tiene cuentas de usuario con backend en Supabase (Postgres + Auth + Realtime):

- **Entrar sin contraseña**: escribís tu mail, te llega un código (o un enlace) y con eso entrás. Botón **Amigos** arriba a la derecha.
- **Perfil propio**: nombre visible, usuario (`@juan`), estado (conectado / ausente / no molestar).
- **Amigos**: buscás a alguien por su usuario, le mandás solicitud, la acepta y listo. Ves quién está conectado.
- **Llamada directa**: al lado de cada amigo conectado hay un botón de llamar. Al otro le suena un aviso; si atiende, los dos entran a la misma sala de voz P2P automáticamente.
- **Canales**: cada usuario crea los suyos, de texto (chat en vivo) o de voz (una sala P2P fija). Se entra con un código de invitación o porque el dueño suma a un amigo.

Los datos viven en Supabase y cada usuario solo ve lo suyo (políticas RLS en la base). El esquema completo está en `supabase/migrations/`. Las claves que hay en `src/supabase/client.js` son públicas por diseño; lo que protege los datos es RLS.

Pendiente: configurar un proveedor de mail propio (SMTP) en Supabase. Con el mail por defecto del plan gratis hay un límite de 2 mails por hora en total, que sirve para probar pero no para uso real.

## Actualizaciones

La app instalada se actualiza sola, sin volver a bajar el instalador:

- Al abrir, busca si hay una versión nueva. Si hay, muestra un aviso con **Actualizar ahora** o **Después**.
- Click en el tag de versión del header (`v1.7.1A`) abre el panel de actualizaciones: **Buscar actualizaciones** y la opción **Actualizar sola al abrir la app**.
- La actualización baja `resources.neu` (la app web empaquetada) desde llamadita.com.ar y reinicia. El ejecutable de Neutralino no cambia, solo hace falta el instalador la primera vez.

### Publicar una versión nueva

1. Subí la versión en `package.json` (es la única fuente: el script la copia a `neutralino.config.json` e `installer.iss`).
2. `npm run build:desktop` → deja `desktop/dist/Llama-dita/resources.neu` y `desktop/update-manifest.json`.
3. `npm run deploy:web` → publica la web oficial con ese manifiesto y ese paquete. **Este paso es el que hace que las apps instaladas vean la versión nueva.**
4. Commit y push a `main`.
4. Opcional, solo si cambió el ejecutable o para instalaciones nuevas: `crear-instalador.bat` (necesita Inno Setup 6).

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