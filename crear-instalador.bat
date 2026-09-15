@echo off
echo ===================================================
echo     COMPILANDO INSTALADOR DE WINDOWS (SETUP.EXE)
echo ===================================================
echo.
echo 1. Compilando codigo web...
call npm run build
echo.
echo 2. Empaquetando version de escritorio...
cd desktop
call npx @neutralinojs/neu build
cd ..
echo.
echo 3. Creando instalador TokiPodcast-Setup.exe...
"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" installer.iss
copy /Y installer_output\TokiPodcast-Setup.exe installer\TokiPodcast-Setup.exe
echo.
echo ===================================================
echo   ¡Listo! Instalador generado en:
echo   installer\TokiPodcast-Setup.exe
echo ===================================================
pause