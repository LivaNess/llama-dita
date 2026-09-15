@echo off
echo Sincronizando con repositorio remoto...
git pull
echo.
echo Actualizando dependencias y compilando...
call npm install
call npm run build
echo.
echo Sincronizacion completada.
pause