@echo off
cd /d "%~dp0"
node sync.mjs >> sync.log 2>&1
node sync.mjs --rights >> sync.log 2>&1
node sync.mjs --pp >> sync.log 2>&1
node sync.mjs --targets >> sync.log 2>&1
