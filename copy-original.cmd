@echo off
chcp 65001 >nul
setlocal
set "SRC=C:\Users\Administrator\.dsh\attachments\v1\objects\64\6470abe55bdb07ab3f2729156b10a538234a8cd24613c7c863c7644f1b84bcb1"
set "DST=%~dp0pet-original.jpg"

if not exist "%SRC%" (
  echo 找不到原始附件，请改用游戏里的「载入原图」按钮。
  pause
  exit /b 1
)

copy /Y "%SRC%" "%DST%" >nul
if errorlevel 1 (
  echo 复制失败，请改用游戏里的「载入原图」按钮。
) else (
  echo 原图已复制到：
  echo %DST%
  echo.
  echo 现在刷新 index.html 即可使用本地原图。
)
pause
