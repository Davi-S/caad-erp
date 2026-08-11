@echo off
setlocal enabledelayedexpansion

title CAAD ERP Updater

echo ===================================================
echo               CAAD ERP - Windows Updater
echo ===================================================
echo.

:: 1. Check prerequisites (Git)
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Git not found. Auto-installing Git via winget...
    winget install Git.Git --accept-source-agreements --accept-package-agreements
    call :REFRESH_PATH
    where git >nul 2>nul
    if !errorlevel! neq 0 (
        echo [ERROR] Git installation failed or Git is not in PATH.
        echo Please install Git manually and try again.
        pause
        exit /b 1
    )
)

:: 2. Create backup directory for user configuration and data files
echo [1/6] Backing up user configuration and data files...
set "BACKUP_DIR=%TEMP%\caad_erp_update_backup_%RANDOM%"
if exist "!BACKUP_DIR!" rd /s /q "!BACKUP_DIR!" 2>nul
mkdir "!BACKUP_DIR!" 2>nul

:: Backup .env files
if exist ".env" (
    copy /y ".env" "!BACKUP_DIR!\root.env" >nul
    echo   - Preserved root .env
)
if exist "backend\.env" (
    copy /y "backend\.env" "!BACKUP_DIR!\backend.env" >nul
    echo   - Preserved backend\.env
)
if exist "frontend\.env" (
    copy /y "frontend\.env" "!BACKUP_DIR!\frontend.env" >nul
    echo   - Preserved frontend\.env
)
if exist "frontend\.env.local" (
    copy /y "frontend\.env.local" "!BACKUP_DIR!\frontend.env.local" >nul
    echo   - Preserved frontend\.env.local
)

:: Backup master_workbook.xlsx files
if exist "backend\master_workbook.xlsx" (
    copy /y "backend\master_workbook.xlsx" "!BACKUP_DIR!\backend_master_workbook.xlsx" >nul
    echo   - Preserved backend\master_workbook.xlsx
)
if exist "master_workbook.xlsx" (
    copy /y "master_workbook.xlsx" "!BACKUP_DIR!\root_master_workbook.xlsx" >nul
    echo   - Preserved root master_workbook.xlsx
)

:: 3. Pull latest updates from Git main branch
echo.
echo [2/6] Fetching latest updates from git repository...

:: Reset tracked local file modifications so git pull won't conflict with tracked master_workbook.xlsx
git checkout -- . >nul 2>&1

:: Checkout main branch and pull latest changes
git checkout main >nul 2>&1
git pull origin main
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Git pull failed! Restoring user files...
    call :RESTORE_BACKUP
    if exist "!BACKUP_DIR!" rd /s /q "!BACKUP_DIR!" 2>nul
    pause
    exit /b 1
)

:: 4. Restore user configuration and data files
echo.
echo [3/6] Restoring user configuration and data files...
call :RESTORE_BACKUP

:: 5. Update root orchestration dependencies
echo.
echo [4/6] Updating root dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [WARNING] Root npm install encountered issues.
)

:: 6. Update backend environment
echo.
echo [5/6] Updating Python backend dependencies...
cd backend
if not exist ".venv\Scripts\python.exe" (
    call uv venv
)
call uv pip install -e ".[api,test]"
if %errorlevel% neq 0 (
    echo [WARNING] Backend dependency update encountered issues.
)
cd ..

:: 7. Update frontend environment & build assets
echo.
echo [6/6] Updating frontend dependencies and building production assets...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo [WARNING] Frontend npm install encountered issues.
)
cd ..

call npm run build:frontend
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed!
    if exist "!BACKUP_DIR!" rd /s /q "!BACKUP_DIR!" 2>nul
    pause
    exit /b 1
)

:: Cleanup backup directory
if exist "!BACKUP_DIR!" rd /s /q "!BACKUP_DIR!" 2>nul

echo.
echo ===================================================
echo  [SUCCESS] CAAD ERP updated successfully!
echo  User files (.env and master_workbook.xlsx) preserved.
echo.
echo  Run start.bat when you are ready to launch the app.
echo ===================================================
echo.
pause
goto :EOF

:RESTORE_BACKUP
if exist "!BACKUP_DIR!\root.env" (
    copy /y "!BACKUP_DIR!\root.env" ".env" >nul
)
if exist "!BACKUP_DIR!\backend.env" (
    copy /y "!BACKUP_DIR!\backend.env" "backend\.env" >nul
)
if exist "!BACKUP_DIR!\frontend.env" (
    copy /y "!BACKUP_DIR!\frontend.env" "frontend\.env" >nul
)
if exist "!BACKUP_DIR!\frontend.env.local" (
    copy /y "!BACKUP_DIR!\frontend.env.local" "frontend\.env.local" >nul
)
if exist "!BACKUP_DIR!\backend_master_workbook.xlsx" (
    copy /y "!BACKUP_DIR!\backend_master_workbook.xlsx" "backend\master_workbook.xlsx" >nul
)
if exist "!BACKUP_DIR!\root_master_workbook.xlsx" (
    copy /y "!BACKUP_DIR!\root_master_workbook.xlsx" "master_workbook.xlsx" >nul
)
goto :EOF

:REFRESH_PATH
:: Helper routine to reload PATH from System and User Environment in Registry
for /f "tokens=2*" %%A in ('reg query "HKLM\System\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USER_PATH=%%B"
set "PATH=%SYS_PATH%;%USER_PATH%"
goto :EOF
