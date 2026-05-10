@echo off
title Bot Discord - Tickets
cd /d "%~dp0"
echo Verificando MariaDB/MySQL local...
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (-not (Get-NetTCPConnection -LocalPort 3306 -ErrorAction SilentlyContinue)) { Write-Host 'MariaDB no esta iniciado. Iniciando MariaDB...'; Start-Process -FilePath 'C:\Program Files\MariaDB 12.2\bin\mysqld.exe' -ArgumentList '--defaults-file=\"C:\Program Files\MariaDB 12.2\data\my.ini\"' -WindowStyle Hidden; Start-Sleep -Seconds 3 } else { Write-Host 'MariaDB ya esta iniciado.' }"
echo.
echo Iniciando bot de Discord...
echo Web local: http://localhost:3000
echo Para detenerlo manualmente presiona Ctrl+C y confirma con S, o cierra esta ventana.
echo.
call npm start
echo.
echo.
echo El bot se detuvo o hubo un error al iniciar.
echo Presiona una tecla para cerrar esta ventana.
pause >nul
