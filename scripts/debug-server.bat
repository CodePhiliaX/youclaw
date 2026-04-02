@echo off
chcp 65001 >nul 2>&1
title YouClaw Server Debug

echo ============================================
echo   YouClaw Server Debug Launcher
echo ============================================
echo.

:: ---- System Info ----
echo [System Info]
echo   OS:
ver
echo   Architecture: %PROCESSOR_ARCHITECTURE%
echo   Username: %USERNAME%
echo.

:: ---- Check VC++ Runtime ----
echo [VC++ Runtime Check]
if exist "%SystemRoot%\System32\vcruntime140.dll" (
    echo   vcruntime140.dll: OK
) else (
    echo   vcruntime140.dll: MISSING !!!
)
if exist "%SystemRoot%\System32\msvcp140.dll" (
    echo   msvcp140.dll: OK
) else (
    echo   msvcp140.dll: MISSING !!!
)
echo.

:: ---- Locate server exe ----
set "SERVER_EXE="

:: Support drag-and-drop: user drags youclaw-server.exe onto this bat
if not "%~1"=="" (
    if exist "%~1" (
        set "SERVER_EXE=%~1"
        goto :found
    )
)

:: Same directory as this script
if exist "%~dp0youclaw-server.exe" (
    set "SERVER_EXE=%~dp0youclaw-server.exe"
    goto :found
)

:: Common install paths
for %%D in (
    "%LOCALAPPDATA%\YouClaw"
    "%LOCALAPPDATA%\Programs\YouClaw"
    "%ProgramFiles%\YouClaw"
) do (
    if exist "%%~D\youclaw-server.exe" (
        set "SERVER_EXE=%%~D\youclaw-server.exe"
        goto :found
    )
)

:: Search all drives for YouClaw folder
for %%X in (C D E F G) do (
    if exist "%%X:\YouClaw\youclaw-server.exe" (
        set "SERVER_EXE=%%X:\YouClaw\youclaw-server.exe"
        goto :found
    )
)

echo [ERROR] youclaw-server.exe not found.
echo.
echo Usage:
echo   1. Copy this script next to youclaw-server.exe, then double-click
echo   2. Or drag youclaw-server.exe onto this script
echo.
goto :end

:found
echo [Server Location]
echo   %SERVER_EXE%
echo.

:: ---- Check exe architecture ----
echo [Binary Check]
if exist "%SERVER_EXE%" (
    for %%F in ("%SERVER_EXE%") do echo   File size: %%~zF bytes
)
echo.

:: ---- Set environment variables ----
set "PORT=62601"
set "HOME=%USERPROFILE%"
set "BUN_TMPDIR=%TEMP%"
set "LOG_LEVEL=debug"

echo [Environment]
echo   PORT=%PORT%
echo   HOME=%HOME%
echo   USERPROFILE=%USERPROFILE%
echo   TEMP=%TEMP%
echo   BUN_TMPDIR=%BUN_TMPDIR%
echo   LOG_LEVEL=%LOG_LEVEL%
echo.

echo ============================================
echo   Starting server... (errors will show below)
echo ============================================
echo.

"%SERVER_EXE%" 2>&1

echo.
echo ============================================
set "EXIT_CODE=%ERRORLEVEL%"
echo   Server exited with code: %EXIT_CODE%

:: Decode common Windows error codes
if "%EXIT_CODE%"=="-1073741795" echo   = 0xC000001D: Illegal Instruction (CPU not supported?)
if "%EXIT_CODE%"=="-1073741795" echo     Bun requires a CPU with AVX support. Check if your CPU supports AVX.
if "%EXIT_CODE%"=="-1073741819" echo   = 0xC0000005: Access Violation (memory error)
if "%EXIT_CODE%"=="-1073741515" echo   = 0xC0000135: DLL Not Found (missing vcruntime140.dll?)
if "%EXIT_CODE%"=="-1073740791" echo   = 0xC0000409: Stack Buffer Overrun
if "%EXIT_CODE%"=="-1073740940" echo   = 0xC0000374: Heap Corruption
echo ============================================

:end
echo.
echo Press any key to close...
pause >nul
