import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { randomBytes } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const app = express();

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Create HTTP server
const server = createServer(app);

// WebSocket server for signaling
const wss = new WebSocketServer({ server });

// Store active connections: code -> websocket
const activeConnections = new Map();

// Generate a random 12-character code
function generateCode() {
  return randomBytes(6).toString('hex').toUpperCase();
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('New client connected');
  
  // Generate unique code for this connection
  let code;
  do {
    code = generateCode();
  } while (activeConnections.has(code));

  // Store the connection
  activeConnections.set(code, ws);

  // Send the code to the client
  ws.send(JSON.stringify({
    type: 'your-code',
    code: code
  }));
  
  console.log(`Assigned code ${code} to client`);

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleMessage(ws, code, message);
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  // Handle disconnection
  ws.on('close', () => {
    console.log(`Client with code ${code} disconnected`);
    activeConnections.delete(code);
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    activeConnections.delete(code);
  });
});

function handleMessage(ws, senderCode, message) {
  const { type, targetCode, ...payload } = message;
  
  switch (type) {
    case 'connect-request':
      handleConnectionRequest(senderCode, targetCode);
      break;
    case 'accept-connection':
      handleAcceptConnection(senderCode, targetCode);
      break;
    case 'reject-connection':
      handleRejectConnection(senderCode, targetCode);
      break;
    case 'offer':
    case 'answer':
    case 'ice-candidate':
      relaySignalingMessage(senderCode, targetCode, message);
      break;
    case 'disconnect':
      handleDisconnect(senderCode, targetCode);
      break;
    default:
      console.log('Unknown message type:', type);
  }
}

function handleConnectionRequest(senderCode, targetCode) {
  const targetWs = activeConnections.get(targetCode);
  
  if (!targetWs) {
    // Target code not found
    const senderWs = activeConnections.get(senderCode);
    if (senderWs) {
      senderWs.send(JSON.stringify({
        type: 'connection-error',
        message: 'Code not found or user offline'
      }));
    }
    return;
  }

  // Send connection request to target
  targetWs.send(JSON.stringify({
    type: 'incoming-connection',
    fromCode: senderCode
  }));
  
  console.log(`Connection request from ${senderCode} to ${targetCode}`);
}

function handleAcceptConnection(senderCode, targetCode) {
  const targetWs = activeConnections.get(targetCode);
  if (targetWs) {
    targetWs.send(JSON.stringify({
      type: 'connection-accepted',
      fromCode: senderCode
    }));
    console.log(`${senderCode} accepted connection from ${targetCode}`);
  }
}

function handleRejectConnection(senderCode, targetCode) {
  const targetWs = activeConnections.get(targetCode);
  if (targetWs) {
    targetWs.send(JSON.stringify({
      type: 'connection-rejected',
      fromCode: senderCode
    }));
    console.log(`${senderCode} rejected connection from ${targetCode}`);
  }
}

function relaySignalingMessage(senderCode, targetCode, message) {
  const targetWs = activeConnections.get(targetCode);
  if (targetWs) {
    targetWs.send(JSON.stringify({
      ...message,
      fromCode: senderCode
    }));
  }
}

function handleDisconnect(senderCode, targetCode) {
  const targetWs = activeConnections.get(targetCode);
  if (targetWs) {
    targetWs.send(JSON.stringify({
      type: 'peer-disconnected',
      fromCode: senderCode
    }));
  }
}

// Start the server
server.listen(PORT, () => {
  console.log(`P2P File Share server running on http://localhost:${PORT}`);
  console.log(`Active connections will be tracked and codes assigned automatically`);
});

// Graceful shutdown with proper WebSocket cleanup
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  
  // Close all WebSocket connections first
  wss.clients.forEach(ws => {
    ws.terminate();
  });
  
  // Then close the server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
