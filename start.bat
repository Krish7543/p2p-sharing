@echo off
echo 🔗 P2P File Share - Setting up...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed.
    echo Please install Node.js from https://nodejs.org/
    echo Then run this script again.
    pause
    exit /b 1
)

echo ✅ Node.js found
node --version

REM Check if npm is installed
npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ npm is not installed.
    echo Please install npm (usually comes with Node.js)
    pause
    exit /b 1
)

echo ✅ npm found
npm --version
echo.

REM Install dependencies
echo 📦 Installing dependencies...
call npm install

if errorlevel 1 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo ✅ Dependencies installed successfully!
echo.
echo 🚀 Starting P2P File Share server...
echo.
echo 📋 Instructions:
echo   1. The server will start on http://localhost:3000
echo   2. Open this URL in your browser
echo   3. Share your 12-character code with others
echo   4. Or enter someone else's code to connect
echo.
echo Press Ctrl+C to stop the server
echo.

REM Start the server
call npm start
pause