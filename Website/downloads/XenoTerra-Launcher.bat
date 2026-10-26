@echo off
:: ================================================================
:: XenoTerra Launcher (free, unsigned, runs natively on Windows)
:: ================================================================
setlocal enabledelayedexpansion

set "LAUNCHER_DIR=%~dp0"
set "GAME_DIR=%LAUNCHER_DIR%XenoTerra\"
set "GAME_ZIP=%LAUNCHER_DIR%XenoTerra-Game.zip"
set "GAME_EXE=%GAME_DIR%XenoTerra.exe"
set "VERSION=0.0.3-alpha"

:: Detect download root (folder this script lives in)
set "DOWNLOAD_ROOT=%LAUNCHER_DIR%"

title XenoTerra Launcher v%VERSION%
color 0F
cls

echo.
echo   ============================================
echo     XenoTerra Launcher v%VERSION%
echo   ============================================
echo.
echo   1. Install / Update XenoTerra
echo   2. Launch XenoTerra
echo   3. Open game folder
echo   4. Exit
echo.
set /p choice="Choose an option: "

if "%choice%"=="1" goto install
if "%choice%"=="2" goto launch
if "%choice%"=="3" goto folder
if "%choice%"=="4" goto exit
goto main

:install
echo.
echo   Checking for game download...
if not exist "%GAME_ZIP%" (
    echo   Game package not found at: %GAME_ZIP%
    echo   Please place XenoTerra-Game.zip in this folder.
    pause
    goto main
)
echo   Game package found. Extracting...
if not exist "%GAME_DIR%" mkdir "%GAME_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%GAME_ZIP%' -DestinationPath '%GAME_DIR%' -Force"
echo.
echo   Installation complete.
pause
goto main

:launch
echo.
if not exist "%GAME_EXE%" (
    echo   XenoTerra is not installed. Choose option 1 to install first.
    pause
    goto main
)
echo   Launching XenoTerra...
start "" "%GAME_EXE%"
goto exit

:folder
echo.
if exist "%GAME_DIR%" (
    explorer "%GAME_DIR%"
) else (
    echo   Game folder does not exist yet. Install the game first.
    pause
)
goto main

:exit
echo.
echo   Goodbye.
endlocal
exit /b
