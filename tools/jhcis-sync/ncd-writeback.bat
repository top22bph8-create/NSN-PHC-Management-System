@echo off
cd /d "%~dp0"
chcp 65001 >nul
echo === ทดลองเขียน (ยังไม่แตะฐานข้อมูล JHCIS) ===
node ncd-writeback.mjs
echo.
echo ถ้าผลถูกต้อง: ปิดโปรแกรม JHCIS ทุกเครื่อง แล้วตอบ Y เพื่อเขียนจริง
choice /m "เขียนลง JHCIS จริงหรือไม่"
if errorlevel 2 goto end
node ncd-writeback.mjs --apply
:end
pause
