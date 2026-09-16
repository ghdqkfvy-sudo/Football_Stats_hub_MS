@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ====================================
echo   K Stats Hub - push to GitHub
echo ====================================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 goto no_repo

git remote get-url origin >nul 2>&1
if errorlevel 1 goto no_remote

rem Detached HEAD? git pull has no branch to rebase against.
git symbolic-ref -q --short HEAD >nul 2>&1
if errorlevel 1 goto detached

git config user.name >nul 2>&1
if errorlevel 1 goto ask_id
git config user.email >nul 2>&1
if errorlevel 1 goto ask_id
goto id_ok

:ask_id
echo First commit on this PC - set the name/email for commits.
set "GN="
set "GE="
set /p GN="  name  [Enter = ghdqkfvy-sudo]      : "
set /p GE="  email [Enter = ghdqkfvy@gmail.com] : "
if "!GN!"=="" set "GN=ghdqkfvy-sudo"
if "!GE!"=="" set "GE=ghdqkfvy@gmail.com"
git config user.name "!GN!"
git config user.email "!GE!"
echo.

:id_ok
rem The snapshot bot commits data every 10 min, so always rebase on pull.
rem This also prevents the old "divergent branches" error.
git config pull.rebase true

set "CHANGED="
for /f "delims=" %%i in ('git status --porcelain') do set "CHANGED=1"
if not defined CHANGED goto nothing

echo Changed files:
echo ------------------------------------
git status --short
echo ------------------------------------
echo.

set "MSG=%~1"
if not "%MSG%"=="" goto got_msg
set "MSG="
set /p MSG="Commit message [Enter = timestamp]: "
if not "!MSG!"=="" goto got_msg
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH:mm"') do set "MSG=update %%i"

:got_msg
echo.
echo Committing: !MSG!
git add -A
git commit -m "!MSG!"
if errorlevel 1 goto commit_failed

set /a TRY=0

:retry
set /a TRY+=1
echo.
echo [try !TRY!/3] pulling remote changes...
git pull --rebase
if errorlevel 1 goto conflict
echo pushing...
git push
if not errorlevel 1 goto done
rem No upstream set yet? Set it once and retry.
git rev-parse --abbrev-ref --symbolic-full-name @{u} >nul 2>&1
if errorlevel 1 (
    echo Setting upstream to origin/main...
    git push -u origin HEAD
    if not errorlevel 1 goto done
)
if !TRY! lss 3 goto again
echo.
echo [ERROR] push failed 3 times.
echo         If a GitHub sign-in window appeared, finish it and run push.bat again.
goto end

:again
echo The data bot pushed in the meantime. Retrying...
goto retry

:detached
echo [STOP] You are not on a branch - detached HEAD.
echo        Your commits are safe, but git cannot pull or push like this.
echo.
echo        Run these one at a time in this folder:
echo            git fetch origin
echo            git rebase origin/main
echo            git branch -f main HEAD
echo            git checkout main
echo            git push origin main
echo.
echo        If the rebase reports a conflict in .github/workflows, run:
echo            git checkout --theirs .github/workflows/snapshot.yml .github/workflows/snapshot-leagues.yml
echo            git add .github/workflows
echo            git rebase --continue
goto end

:conflict
echo.
echo [STOP] Rebase failed - conflict, or no upstream branch.
echo        Usually happens if you ran "npm run snapshot" locally and
echo        changed web/public/data, which the bot also owns.
echo.
echo        To undo, type these two lines here:
echo            git rebase --abort
echo            git checkout -- web/public/data
echo        Then run push.bat again.
goto end

:commit_failed
echo.
echo [ERROR] commit failed - see the message above.
goto end

:nothing
echo No local changes to push. Checking remote for new commits...
git pull --rebase
goto end

:no_repo
echo [ERROR] This folder is not a git repository.
echo.
echo         push.bat must sit inside the project folder, next to README.md.
echo         If you have not cloned it yet, run this once:
echo.
echo         git clone https://github.com/ghdqkfvy-sudo/Football_Stats_hub_MS.git
echo.
goto end

:no_remote
echo [ERROR] No remote named "origin".
echo         Run this once, then try again:
echo.
echo         git remote add origin https://github.com/ghdqkfvy-sudo/Football_Stats_hub_MS.git
echo.
goto end

:done
echo.
echo [OK] Pushed to GitHub.
echo      Build status: https://github.com/ghdqkfvy-sudo/Football_Stats_hub_MS/actions
echo      The site usually updates 1-2 minutes later.

:end
echo.
pause
