@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ==============================================
echo   MS Stats Hub - roll back the mobile UI work
echo ==============================================
echo.
echo  Batch 1 [mobile-ux]  : header compression, font-size floor, tap areas
echo  Batch 2 [mobile-ux2] : crest team row, short tabs, news list, one-line
echo                         match cards, week list, mini bar, table summary
echo.
echo  Uses "git revert" - history is kept, nothing is deleted,
echo  and data commits from the bot are not touched.
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 goto no_repo

git diff --quiet
if errorlevel 1 goto dirty
git diff --cached --quiet
if errorlevel 1 goto dirty

echo   1 = undo batch 2 only  (recommended - keeps batch 1)
echo   2 = undo batch 1 and batch 2
echo.
set "CH="
set /p CH="  Choose [1/2, Enter = 1] : "
if "!CH!"=="" set "CH=1"
rem %CH% (not !CH!) on purpose: a line with "!" makes cmd strip the ^ in the grep patterns.
if "%CH%"=="1" (
  git log --grep="^\[mobile-ux2\]" --format=%%H > "%TEMP%\msux.txt"
) else if "%CH%"=="2" (
  git log -E --grep="^\[mobile-ux2?\]" --format=%%H > "%TEMP%\msux.txt"
) else (
  goto cancelled
)

rem Skip commits that were already reverted earlier.
type nul > "%TEMP%\msux_todo.txt"
for /f "usebackq delims=" %%c in ("%TEMP%\msux.txt") do (
  set "DONE="
  for /f %%r in ('git log --grep^="This reverts commit %%c" --format^=%%h -n 1') do set "DONE=1"
  if not defined DONE echo %%c>>"%TEMP%\msux_todo.txt"
)
for %%A in ("%TEMP%\msux_todo.txt") do if %%~zA equ 0 goto none

echo.
echo  Commits to undo (newest first):
for /f "usebackq delims=" %%c in ("%TEMP%\msux_todo.txt") do git log -1 --format="   %%h  %%s" %%c
echo.
set "OK="
set /p OK="  Roll these back and push? [y/N] : "
if /i not "!OK!"=="y" goto cancelled

for /f "usebackq delims=" %%c in ("%TEMP%\msux_todo.txt") do (
  git revert --no-edit %%c
  if errorlevel 1 goto conflict
)

echo.
echo  Rolled back. Pushing now...
echo.
call "%~dp0push.bat"
goto end

:none
echo  Nothing to undo - already rolled back (or no such commits).
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
