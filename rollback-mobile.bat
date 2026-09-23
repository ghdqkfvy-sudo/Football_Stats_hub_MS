@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ==============================================
echo   MS Stats Hub - roll back the mobile UI batch
echo ==============================================
echo.
echo  Undoes every commit whose subject starts with [mobile-ux]
echo  (header compression, font-size floor, bigger tap areas)
echo  using "git revert" - history is kept, nothing is deleted,
echo  and data commits from the bot are not touched.
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 goto no_repo

git diff --quiet
if errorlevel 1 goto dirty
git diff --cached --quiet
if errorlevel 1 goto dirty

git log --grep="^Revert .\[mobile-ux\]" --format=%%h -n 1 > "%TEMP%\msux_done.txt"
for %%A in ("%TEMP%\msux_done.txt") do if %%~zA gtr 0 goto already

git log --grep="^\[mobile-ux\]" --format=%%H > "%TEMP%\msux.txt"
for %%A in ("%TEMP%\msux.txt") do if %%~zA equ 0 goto none

echo  Commits to undo (newest first):
git log --grep="^\[mobile-ux\]" --format="   %%h  %%s"
echo.
set "OK="
set /p OK="  Roll these back and push? [y/N] : "
if /i not "!OK!"=="y" goto cancelled

for /f "usebackq delims=" %%c in ("%TEMP%\msux.txt") do (
  git revert --no-edit %%c
  if errorlevel 1 goto conflict
)

echo.
echo  Rolled back. Pushing now...
echo.
call "%~dp0push.bat"
goto end

:already
echo  The mobile batch is already rolled back - nothing to do.
goto done
:none
echo  No [mobile-ux] commits found - nothing to do.
goto done
:dirty
echo  You have uncommitted changes. Commit or discard them first.
goto done
:cancelled
echo  Cancelled - nothing changed.
goto done
:conflict
echo.
echo  A revert hit a conflict. Undoing the half-finished revert...
git revert --abort
echo  Nothing was pushed. Ask Claude to roll back by hand.
goto done
:no_repo
echo  This folder is not a git repository.
goto done

:done
echo.
pause
:end
endlocal
