@echo off
title Bot Discord - Tickets
cd /d "%~dp0"
echo.
echo Iniciando bot de Discord...
echo Web local: http://localhost:3000
echo Base de datos: MongoDB Atlas configurado en .env
echo Para detenerlo manualmente presiona Ctrl+C y confirma con S, o cierra esta ventana.
echo.
call npm start
echo.
echo.
echo El bot se detuvo o hubo un error al iniciar.
echo Presiona una tecla para cerrar esta ventana.
pause >nul
