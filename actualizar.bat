@echo off
echo ==========================================
echo    ACTUALIZANDO TOKI PODCAST CON GITHUB
echo ==========================================
git pull
echo.
echo Compilando la ultima version...
call npm install
call npm run build
echo.
echo ==========================================
echo  ¡Listo! Ya tienes la version mas reciente.
echo ==========================================
pause