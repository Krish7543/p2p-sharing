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

// Add CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

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

// Handle WebSocket server errors
wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});


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
  const { type, targetCode, ...payload } = message || {};
  
  if (!type) {
    console.error('Received message without type:', message);
    return;
  }
  
  switch (type) {
    case 'request-code':
    // Remove all previous codes mapped to this ws before assigning a new one
    for (const [existingCode, wsConn] of activeConnections.entries()) {
        if (wsConn === ws) activeConnections.delete(existingCode);
    }
    // Generate and send a new code to the client
    const newCode = generateCode();
    activeConnections.set(newCode, ws);
    console.log('Assigned new code:', newCode);
    ws.send(JSON.stringify({
        type: 'your-code',
        code: newCode
    }));
    break;

      
    case 'connect-request':
      if (!targetCode) {
        console.error('Missing targetCode for connect-request');
        return;
      }
      handleConnectionRequest(senderCode, targetCode);
      break;
      
    case 'accept-connection':
      if (!targetCode) {
        console.error('Missing targetCode for accept-connection');
        return;
      }
      handleAcceptConnection(senderCode, targetCode);
      break;
      
    case 'reject-connection':
      if (!targetCode) {
        console.error('Missing targetCode for reject-connection');
        return;
      }
      handleRejectConnection(senderCode, targetCode);
      break;
      
    case 'offer':
    case 'answer':
    case 'ice-candidate':
      if (!targetCode) {
        console.error(`Missing targetCode for ${type}`);
        return;
      }
      relaySignalingMessage(senderCode, targetCode, message);
      break;
      
    case 'disconnect':
      if (targetCode) {
        handleDisconnect(senderCode, targetCode);
      }
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

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process, keep it running
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process, keep it running
});

// Start the server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`P2P File Share server running on http://0.0.0.0:${PORT}`);
});

// Graceful shutdown with proper WebSocket cleanup
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  
  
  // Close all WebSocket connections
  if (wss && wss.clients) {
    wss.clients.forEach((client) => {
      if (client.readyState === 1) { // 1 = OPEN
        client.close(1000, 'Server shutting down');
      }
    });
    
    // Close the WebSocket server
    wss.close(() => {
      console.log('WebSocket server closed');
    });
  }
  
  // Close the HTTP server if it exists
  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
    
    // Force exit after 5 seconds if graceful shutdown takes too long
    setTimeout(() => {
      console.error('Forcing server shutdown...');
      process.exit(1);
    }, 5000);
  } else {
    process.exit(0);
  }
});
