@echo off
cd /d "%~dp0"
chcp 65001 >nul
echo === ตรวจจำนวนก่อนส่ง (ยังไม่ส่ง) ===
node sync.mjs --ncd-targets --check
echo.
choice /m "ส่งรายชื่อขึ้นระบบเลยหรือไม่"
if errorlevel 2 goto end
node sync.mjs --ncd-targets
:end
pause
