@echo off
chcp 65001 > nul
cd /d "%~dp0.."
title 원준 영상 분석 도우미
echo 원준 영상 분석 도우미를 시작합니다.
echo 이 창을 닫으면 자동 분석이 중지됩니다.
echo.
npm run worker:video
pause
