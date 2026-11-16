@echo off
chcp 65001 >nul
title Set NSN-PHC sync key
cd /d "%~dp0"
echo ============================================
echo  ตั้งคีย์เชื่อมข้อมูล JHCIS
echo ============================================
echo ถ้าเพิ่งกด "สร้างคีย์" ในเว็บ ระบบจะดึงคีย์จากคลิปบอร์ดให้เอง
echo ถ้าไม่พบ จะให้วางคีย์ (คลิกขวา 1 ครั้งในหน้าต่างนี้ = วาง) แล้วกด Enter
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$k=''; try { $c=Get-Clipboard -Raw; if($c){$k=$c.Trim()} } catch {}; if($k.Length -lt 30 -or $k -match '\s'){ $k=(Read-Host 'วางคีย์ที่นี่แล้วกด Enter').Trim() }; if($k.Length -lt 30 -or $k -match '\s'){Write-Host 'คีย์ไม่ถูกต้อง (สั้นเกินไปหรือมีช่องว่าง)'; exit 1}; $p=Join-Path (Get-Location) 'config.json'; $j=[IO.File]::ReadAllText($p) | ConvertFrom-Json; $j.apiKey=$k; [IO.File]::WriteAllText($p,($j | ConvertTo-Json),(New-Object Text.UTF8Encoding $false)); Write-Host ('บันทึกคีย์ใหม่แล้ว (ยาว '+$k.Length+' ตัวอักษร)')"
if errorlevel 1 ( echo. & echo ไม่สำเร็จ & pause & exit /b 1 )
echo.
echo รีสตาร์ตตัวรอรับคำสั่ง...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { $_.CommandLine -match 'sync.mjs' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
timeout /t 20 /nobreak >nul
echo.
echo ผลล่าสุดใน watch.log:
powershell -NoProfile -Command "Get-Content watch.log -Tail 3"
echo.
echo ถ้าไม่มีคำว่า 401 แสดงว่าเชื่อมต่อแล้ว ดูหน้าเว็บ (ควรขึ้น 🟢)
pause
