@echo off
chcp 65001 >nul
title Install NSN-PHC keepalive
cd /d "%~dp0"
echo ============================================
echo  ติดตั้งตัวเฝ้าระวังการเชื่อมต่อ JHCIS (เชื่อมต่อกลับอัตโนมัติ)
echo ============================================
echo.
set "DIR=%~dp0"
schtasks /create /tn "NSN-PHC Keepalive" /tr "wscript.exe \"%DIR%run-hidden.vbs\" keepalive.bat" /sc minute /mo 1 /f
if errorlevel 1 ( echo. & echo ติดตั้งไม่สำเร็จ - ลองคลิกขวาไฟล์นี้ แล้วเลือก Run as administrator & pause & exit /b 1 )
schtasks /run /tn "NSN-PHC Keepalive"
echo.
echo เรียบร้อย: ตั้งแต่นี้ทุก 1 นาทีระบบจะตรวจว่าตัวเชื่อมต่อ JHCIS ยังทำงานอยู่ ถ้าหยุดจะเปิดกลับมาให้เองทันที
echo (ถอนการติดตั้ง: schtasks /delete /tn "NSN-PHC Keepalive" /f)
echo.
pause
