@echo off
setlocal enabledelayedexpansion

title CAAD ERP Launcher

echo ===================================================
echo               CAAD ERP - Windows Launcher
echo ===================================================
echo.

:: 1. Check if first-time setup is needed
if not exist "backend\.venv\Scripts\python.exe" (
    echo [INFO] First-time run detected. Starting setup...
    goto SETUP
)
if not exist "node_modules" (
    echo [INFO] Root dependencies missing. Starting setup...
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
echo [1/5] Checking prerequisites (Node.js, Python, uv)...

:: Check Node.js / npm
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Node.js not found. Auto-installing Node.js LTS via winget...
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    call :REFRESH_PATH
)

:: Check Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Python not found. Auto-installing Python 3.12 via winget...
    winget install Python.Python.3.12 --accept-source-agreements --accept-package-agreements
    call :REFRESH_PATH
)

:: Check uv package manager
where uv >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] uv not found. Auto-installing uv via winget...
    winget install astral-sh.uv --accept-source-agreements --accept-package-agreements
    call :REFRESH_PATH
)

echo [2/5] Installing root orchestration dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed!
    pause
    exit /b 1
)

echo [3/5] Setting up Python backend environment...
cd backend
call uv venv
call uv pip install -e ".[api,test]"
if %errorlevel% neq 0 (
    echo [ERROR] Backend environment setup failed!
    cd ..
    pause
    exit /b 1
)
cd ..

echo [4/5] Setting up frontend environment...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Frontend npm install failed!
    cd ..
    pause
    exit /b 1
)
cd ..

echo [5/5] Building production frontend assets...
call npm run build:frontend
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed!
    pause
    exit /b 1
)

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
cd backend
call uv run caad-erp
cd ..

pause
goto :EOF

:REFRESH_PATH
:: Helper routine to reload PATH from System and User Environment in Registry
for /f "tokens=2*" %%A in ('reg query "HKLM\System\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USER_PATH=%%B"
set "PATH=%SYS_PATH%;%USER_PATH%"
goto :EOF
