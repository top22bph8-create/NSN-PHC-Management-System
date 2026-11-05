@echo off
cd /d "%~dp0"
node sync.mjs >> sync.log 2>&1
