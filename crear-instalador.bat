@echo off
echo Compilando aplicacion web...
call npm run build
echo.
echo Sincronizando recursos con cliente de escritorio...
xcopy /E /Y /I dist\* desktop\resources\
echo.
echo Empaquetando cliente de escritorio...
cd desktop
call npx @neutralinojs/neu build
cd ..
echo.
echo Generando instalador Llama-dita-Setup.exe...
"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" installer.iss
echo.
echo Instalador generado exitosamente en installer\Llama-dita-Setup.exe
pause