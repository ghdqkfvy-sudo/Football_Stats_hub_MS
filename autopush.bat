@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

rem ============================================================
rem   MS Stats Hub - autopush
rem
rem   WHY THIS EXISTS
rem   Claude works in an isolated Linux VM that can reach github.com
rem   but has no GitHub credential - yours live in the Windows
rem   Credential Manager, which that VM cannot see. So Claude can
rem   commit but not push.
rem
rem   This script closes that gap from the Windows side: it watches
rem   for commits that are not on GitHub yet and pushes them using
rem   the credentials you already have.
rem
rem   It NEVER creates a commit. It only ships commits that already
rem   exist, so nothing reaches GitHub that was not committed first.
rem
rem   USAGE
rem     autopush.bat            watch every 60s (close the window to stop)
rem     autopush.bat once       check once and exit (for Task Scheduler)
rem     autopush.bat install    register a Task Scheduler job (every 5 min)
rem     autopush.bat uninstall  remove that job
rem
rem   NOTE: main is public and auto-deploys, so a push here publishes.
rem   If you would rather review first, do not run this - use push.bat.
rem ============================================================

set "MODE=%~1"
if /i "%MODE%"=="install"   goto install
if /i "%MODE%"=="uninstall" goto uninstall

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [ERROR] This folder is not a git repository.
    if /i not "%MODE%"=="once" pause
    exit /b 1
)

rem The snapshot bot commits data every ~20 min, so always rebase on pull.
git config pull.rebase true

rem Never sit waiting for a username prompt - under Task Scheduler there is no
rem console to type into and the task would hang forever. Fail fast instead.
set "GIT_TERMINAL_PROMPT=0"

if /i "%MODE%"=="once" (
    call :cycle
    exit /b !errorlevel!
)

echo ====================================
echo   MS Stats Hub - autopush (watching)
echo ====================================
echo   Checking every 60 seconds.
echo   Close this window to stop.
echo.

:loop
call :cycle
timeout /t 60 /nobreak >nul
goto loop

rem ---------- one check ----------
:cycle
rem A rebase left half-done means a human has to look - do not thrash.
if exist ".git\rebase-merge" goto stuck
if exist ".git\rebase-apply" goto stuck

git fetch --quiet origin 2>nul
if errorlevel 1 (
    call :say "fetch failed - offline? will retry"
    exit /b 0
)

set "AHEAD="
for /f %%i in ('git rev-list --count @{u}..HEAD 2^>nul') do set "AHEAD=%%i"
if not defined AHEAD exit /b 0
if "!AHEAD!"=="0" exit /b 0

rem Uncommitted edits would be swept into the rebase - leave them alone.
set "DIRTY="
for /f "delims=" %%i in ('git status --porcelain 2^>nul') do set "DIRTY=1"
if defined DIRTY (
    call :say "!AHEAD! commit/s waiting, but there are uncommitted changes - skipping"
    exit /b 0
)

call :say "pushing !AHEAD! new commit/s..."
git log --oneline @{u}..HEAD

git pull --rebase --quiet
if errorlevel 1 goto conflict

git push --quiet
if errorlevel 1 (
    call :say "push failed - if a GitHub sign-in window appeared, finish it"
    exit /b 0
)
call :say "pushed OK"
exit /b 0

:conflict
call :say "[STOP] rebase conflict - autopush will not touch it"
echo        Run "git status" in this folder and resolve it, or:
echo            git rebase --abort
exit /b 1

:stuck
call :say "[STOP] a rebase is already in progress - resolve it first"
exit /b 1

rem ---------- helpers ----------
:say
for /f "tokens=1-2 delims=." %%a in ("%time%") do set "NOW=%%a"
echo [!NOW!] %~1
exit /b 0

rem ---------- Task Scheduler ----------
:install
echo Registering a Task Scheduler job that runs every 5 minutes...
schtasks /create /tn "MS Stats Hub autopush" /tr "\"%~f0\" once" /sc minute /mo 5 /f
if errorlevel 1 (
    echo [ERROR] Could not register. Try running this file as Administrator.
) else (
    echo [OK] Registered. It now pushes new commits within 5 minutes.
    echo      Remove it later with:  autopush.bat uninstall
)
pause
exit /b 0

:uninstall
schtasks /delete /tn "MS Stats Hub autopush" /f
echo [OK] Removed (if it existed).
pause
exit /b 0
