@echo off
echo Compilando aplicacion web...
call npm run build:desktop
echo.
echo Generando instalador Llama-dita-Setup.exe...
"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" installer.iss
echo.
echo Instalador generado exitosamente en installer\Llama-dita-Setup.exe
pause