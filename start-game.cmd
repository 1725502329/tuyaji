@echo off
chcp 65001 >nul
setlocal
set "SRC=C:\Users\Administrator\.dsh\attachments\v1\objects\64\6470abe55bdb07ab3f2729156b10a538234a8cd24613c7c863c7644f1b84bcb1"
set "DST=%~dp0pet-original.jpg"

if not exist "%DST%" (
  if exist "%SRC%" (
    copy /Y "%SRC%" "%DST%" >nul
  )
)

start "" "%~dp0index.html"
exit /b 0
