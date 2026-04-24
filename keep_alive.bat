@echo off
:loop
curl -I https://kr-realestate.onrender.com
echo %date% %time% - Ping sent >> keepalive_log.txt
timeout /t 840 /nobreak
goto loop