@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ====================================
echo   MS Stats Hub - apply update
echo ====================================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 goto no_repo

rem Find the newest k-stats-hub*.tar.gz in the Downloads folder.
set "PKG="
for /f "delims=" %%f in ('dir /b /a-d /o-d "%USERPROFILE%\Downloads\k-stats-hub*.tar.gz" 2^>nul') do (
    if not defined PKG set "PKG=%USERPROFILE%\Downloads\%%f"
)
if not defined PKG goto no_pkg

echo Package : !PKG!
echo Target  : %CD%
echo.
echo This overwrites the source files in this folder.
set "YN="
set /p YN="Continue? [Y/N] : "
if /i not "!YN!"=="Y" goto cancelled

echo.
echo Extracting...
rem Strip the leading "ksh/" folder from the archive.
rem Skip this running script - overwriting it mid-run breaks cmd.
tar -xzf "!PKG!" -C . --strip-components=1 --exclude=*apply-update.bat
if errorlevel 1 goto untar_failed

echo.
echo Changed files:
echo ------------------------------------
git status --short
echo ------------------------------------
echo.

set "YN="
set /p YN="Push to GitHub now? [Y/N] : "
if /i "!YN!"=="Y" goto do_push

echo.
echo Not pushed. Run push.bat when you are ready.
goto end

:do_push
echo.
call "%~dp0push.bat" "apply update"
goto quiet_end

:no_pkg
echo [ERROR] No package found in the Downloads folder.
echo         Looking for : k-stats-hub*.tar.gz
echo         In          : %USERPROFILE%\Downloads
echo.
echo         Download the file from the chat, leave it in Downloads, and retry.
goto end

:untar_failed
echo [ERROR] Extract failed.
echo         Windows 10 build 1803 and later ship tar.exe by default.
goto end

:no_repo
echo [ERROR] This folder is not a git repository.
echo         apply-update.bat must sit inside the project folder.
goto end

:cancelled
echo Cancelled.

:end
echo.
pause

:quiet_end
endlocal
