@echo off
:: ตัวเฝ้าระวัง: ถ้าตัวรอรับคำสั่ง JHCIS (sync.mjs --watch) หยุดทำงาน/ถูกปิด ให้เปิดกลับมาเอง (รันทุก 1 นาทีจาก Task Scheduler แบบซ่อนหน้าต่าง)
cd /d "%~dp0"
powershell -NoProfile -Command "$p = Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'sync\.mjs.*--watch') -or ($_.Name -eq 'cmd.exe' -and $_.CommandLine -match 'run-watch-bg') }; if ($p) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo %date% %time% watcher not running - restarting>> keepalive.log
  wscript.exe "%~dp0run-hidden.vbs" run-watch-bg.bat
)
