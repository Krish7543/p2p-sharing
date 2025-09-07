#!/bin/bash

# P2P File Share - Quick Start Script

echo "🔗 P2P File Share - Setting up..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    echo "Please install Node.js from https://nodejs.org/"
    echo "Then run this script again."
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    echo "Please install npm (usually comes with Node.js)"
    exit 1
fi

echo "✅ npm found: $(npm --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully!"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo ""
echo "🚀 Starting P2P File Share server..."
echo ""
echo "📋 Instructions:"
echo "  1. The server will start on http://localhost:3000"
echo "  2. Open this URL in your browser"
echo "  3. Share your 12-character code with others"
echo "  4. Or enter someone else's code to connect"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
npm start