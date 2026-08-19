@echo off
setlocal enabledelayedexpansion

title CAAD ERP Launcher

echo ===================================================
echo               CAAD ERP - Windows Launcher
echo ===================================================
echo.

:: 1. Check if first-time setup is needed
if not exist "node_modules" (
    echo [INFO] Root dependencies missing. Starting setup...
    goto SETUP
)
if not exist "backend-ts\node_modules" (
    echo [INFO] Backend-TS dependencies missing. Starting setup...
    goto SETUP
)
if not exist "frontend\node_modules" (
    echo [INFO] Frontend dependencies missing. Starting setup...
    goto SETUP
)
if not exist "frontend\dist\index.html" (
    echo [INFO] Built frontend assets missing. Starting setup...
    goto SETUP
)

goto LAUNCH

:SETUP
echo.
echo [1/4] Checking prerequisites (Node.js)...

:: Check Node.js / npm
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Node.js not found. Auto-installing Node.js LTS via winget...
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    call :REFRESH_PATH
)

echo [2/4] Installing root orchestration dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed!
    pause
    exit /b 1
)

echo [3/4] Setting up TypeScript backend environment...
cd backend-ts
call npm install
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Backend-TS build failed!
    cd ..
    pause
    exit /b 1
)
cd ..

echo [4/4] Setting up frontend environment...
cd frontend
call npm install
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed!
    cd ..
    pause
    exit /b 1
)
cd ..

echo.
echo [SUCCESS] Setup complete!
echo.

:LAUNCH
if not exist "frontend\dist\index.html" (
    echo [INFO] Built frontend assets missing. Building frontend assets...
    call npm run build:frontend
    if %errorlevel% neq 0 (
        echo [ERROR] Frontend build failed!
        pause
        exit /b 1
    )
)

echo.
echo ====================================================================
echo  [IMPORTANT WARNING]
echo  DO NOT CLOSE THIS TERMINAL WINDOW!
echo  Closing this window will immediately stop the CAAD ERP application.
echo  To exit properly, press Ctrl+C in this terminal.
echo ====================================================================
echo.
echo Starting CAAD ERP server at http://localhost:8000 ...
echo.

:: Open browser after a brief delay
start http://localhost:8000

:: Start unified server
npm start

pause
goto :EOF

:REFRESH_PATH
:: Helper routine to reload PATH from System and User Environment in Registry
for /f "tokens=2*" %%A in ('reg query "HKLM\System\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USER_PATH=%%B"
set "PATH=%SYS_PATH%;%USER_PATH%"
goto :EOF
