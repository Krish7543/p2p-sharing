class P2PFileShare {
  constructor() {
    this.peer = null;
    this.connection = null;
    this.ws = null;
    this.myCode = '';
    this.isConnected = false;
    this.currentCall = null;
    this.localStream = null;
    this.remoteStream = null;
    
    // Ack synchronization state
    this.pendingAcks = {};
    this.lastTypingSentAt = 0;
    this.typingTimeoutId = null;
    
    // File transfer state
    this.currentFileMetadata = null;
    this.fileChunks = [];
    this.currentTransferId = null;
    this.currentBatch = null;
    
    // Call state
    this.callState = 'idle'; // idle, calling, receiving, connected
    this.isVideoCall = false;
    this.isMuted = false;
    this.isVideoOff = false;
    
    this.init();
  }

  async init() {
    // Handle URL code parameter
    this.handleUrlCode();
    
    // Initialize WebSocket first
    await this.initializeWebSocket();
    
    // Setup UI after WebSocket is ready
    this.setupUI();
    this.setupTabNavigation();
    this.initializeQRCode();
  }

  handleUrlCode() {
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get('code');
    if (codeFromUrl) {
      const input = document.getElementById('peerCode');
      if (input) {
        input.value = codeFromUrl.trim().toUpperCase();
      }
    }
  }

  async initializeWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${location.host}`);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleWebSocketMessage(event);
        };

        this.ws.onclose = () => {
          this.updateStatus('Disconnected from server');
          setTimeout(() => this.initializeWebSocket(), 3000); // Reconnect
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  handleWebSocketMessage(event) {
    try {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'your-code':
          this.handleCodeAssignment(message.code);
          break;
        case 'connection-error':
          this.handleConnectionError(message.message);
          break;
        case 'incoming-connection':
          this.handleIncomingConnection(message.fromCode);
          break;
        case 'connection-accepted':
          this.handleConnectionAccepted(message.fromCode);
          break;
        case 'connection-rejected':
          this.handleConnectionRejected(message.fromCode);
          break;
        default:
          console.log('Unknown WebSocket message:', message);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  }

  handleCodeAssignment(code) {
    this.myCode = code;
    
    // Update UI elements
    const codeDisplay = document.getElementById('connectionCode');
    if (codeDisplay) {
      codeDisplay.textContent = code;
    }

    // Enable copy button
    const copyBtn = document.getElementById('copyCode');
    if (copyBtn) {
      copyBtn.disabled = false;
      copyBtn.onclick = () => this.copyCodeToClipboard();
    }

    // Enable connect form
    const peerInput = document.getElementById('peerCode');
    const connectBtn = document.getElementById('connectBtn');
    if (peerInput) peerInput.disabled = false;
    if (connectBtn) connectBtn.disabled = false;

    // Update server status
    const serverStatus = document.getElementById('serverStatus');
    if (serverStatus) {
      serverStatus.classList.add('connected');
    }

    // Update connection status
    const connectionStatus = document.getElementById('connectionStatus');
    if (connectionStatus) {
      const indicator = connectionStatus.querySelector('.status-indicator');
      const span = connectionStatus.querySelector('span');
      if (indicator) {
        indicator.classList.remove('waiting', 'error');
        indicator.classList.add('connected');
      }
      if (span) span.textContent = 'Ready to connect!';
    }

    // Update QR code
    this.updateQRCode(code);

    // Initialize PeerJS
    this.initializePeerJS();

    this.updateStatus('Ready to connect!');
  }

  handleConnectionError(message) {
    alert(message);
    this.updateStatus('Connection failed: ' + message);
  }

  handleIncomingConnection(fromCode) {
    const accept = confirm(`Accept connection from ${fromCode}?`);
    if (accept) {
      this.sendWebSocketMessage({
        type: 'accept-connection',
        targetCode: fromCode
      });
    } else {
      this.sendWebSocketMessage({
        type: 'reject-connection',
        targetCode: fromCode
      });
    }
  }

  handleConnectionAccepted(fromCode) {
    this.updateStatus(`Connection accepted by ${fromCode}. Establishing P2P...`);
    // PeerJS connection will be handled in setupConnection
  }

  handleConnectionRejected(fromCode) {
    this.updateStatus(`Connection rejected by ${fromCode}`);
  }

  sendWebSocketMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket not ready');
    }
  }

  async copyCodeToClipboard() {
    try {
      await navigator.clipboard.writeText(this.myCode);
      this.notify('Code copied to clipboard', 'success');
    } catch (error) {
      console.error('Failed to copy code:', error);
      this.notify('Failed to copy code', 'error');
    }
  }

  updateQRCode(code) {
    const qrElement = document.getElementById('qrCode');
    if (!qrElement) return;

    qrElement.innerHTML = '';

    if (!code) {
      qrElement.innerHTML = '<div class="qr-placeholder">Connect to get a code</div>';
      return;
    }

    try {
      // Generate connection URL with custom domain
      const connectionUrl = `http://sujal.netbird.cloud:3000${window.location.pathname}?code=${encodeURIComponent(code)}`;

      // Use qrcode-generator for raw module matrix
      const qr = qrcode(0, 'H');
      qr.addData(connectionUrl);
      qr.make();

      const moduleCount = qr.getModuleCount();
      const size = 200;
      const quietZone = 10;
      const moduleSize = (size - quietZone * 2) / moduleCount;

      // Create SVG
      let svg = `<svg width="100%" height="100%" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`;
      
      // Background gradient
      svg += '<defs>';
      svg += '<linearGradient id="qrBg" x1="0%" y1="0%" x2="100%" y2="100%">';
      svg += '<stop offset="0%" stop-color="var(--color-charcoal-700)" />';
      svg += '<stop offset="100%" stop-color="var(--color-charcoal-800)" />';
      svg += '</linearGradient>';
      
      // Module gradient
      svg += '<linearGradient id="qrModule" x1="0%" y1="0%" x2="100%" y2="100%">';
      svg += '<stop offset="0%" stop-color="var(--color-teal-300)" />';
      svg += '<stop offset="100%" stop-color="var(--color-primary)" />';
      svg += '</linearGradient>';
      svg += '</defs>';

      // Background
      svg += '<rect width="100%" height="100%" fill="url(#qrBg)" rx="8" />';

      // QR modules
      svg += '<g fill="url(#qrModule)">';
      for (let r = 0; r < moduleCount; r++) {
        for (let c = 0; c < moduleCount; c++) {
          if (qr.isDark(r, c)) {
            const x = quietZone + c * moduleSize;
            const y = quietZone + r * moduleSize;
            svg += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${moduleSize.toFixed(2)}" height="${moduleSize.toFixed(2)}" rx="1"/>`;
          }
        }
      }
      svg += '</g>';

      // Border
      svg += `<rect x="${quietZone}" y="${quietZone}" width="${size - 2 * quietZone}" height="${size - 2 * quietZone}" fill="none" stroke="var(--color-primary)" stroke-width="2" rx="6"/>`;
      svg += '</svg>';

      qrElement.innerHTML = svg;
      
      // Add click to copy functionality
      qrElement.onclick = () => this.copyCodeToClipboard();
      qrElement.style.cursor = 'pointer';

    } catch (error) {
      console.error('Error generating QR code:', error);
      qrElement.innerHTML = '<div class="qr-error">Failed to generate QR code</div>';
    }
  }

  initializePeerJS() {
    try {
      this.peer = new Peer(this.myCode, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        console.log('PeerJS ready with ID:', id);
        this.updateStatus('Ready to connect!');
      });

      this.peer.on('connection', (conn) => {
        console.log('Incoming data connection from:', conn.peer);
        this.handleIncomingDataConnection(conn);
      });

      this.peer.on('call', (call) => {
        console.log('Incoming call from:', call.peer);
        this.handleIncomingCall(call);
      });

      this.peer.on('error', (error) => {
        console.error('PeerJS error:', error);
        this.updateStatus('PeerJS error: ' + error.type);
        
        // Handle specific errors
        if (error.type === 'peer-unavailable') {
          this.notify('Peer is not available', 'error');
        } else if (error.type === 'network') {
          this.notify('Network error. Please check your connection', 'error');
        }
      });
    } catch (error) {
      console.error('Failed to initialize PeerJS:', error);
      this.updateStatus('Failed to initialize peer connection');
    }
  }

  setupUI() {
    // Connect button
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
      connectBtn.onclick = (e) => {
        e.preventDefault();
        this.connectToPeer();
      };
    }

    // Connect form
    const connectForm = document.getElementById('connectForm');
    if (connectForm) {
      connectForm.onsubmit = (e) => {
        e.preventDefault();
        this.connectToPeer();
      };
    }

    // Peer input enter key
    const peerInput = document.getElementById('peerCode');
    if (peerInput) {
      peerInput.oninput = (e) => {
        // Auto-format and validate
        let value = e.target.value.toUpperCase().replace(/[^A-F0-9]/g, '');
        if (value.length > 12) value = value.slice(0, 12);
        e.target.value = value;
      };
    }

    // Disconnect button
    const disconnectBtn = document.getElementById('disconnectBtn');
    if (disconnectBtn) {
      disconnectBtn.onclick = () => this.disconnect();
    }

    // File handling
    this.setupFileHandling();
    
    // Chat functionality
    this.setupChat();
    
    // Call functionality
    this.setupCalls();
  }

  setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-btn[data-tab]');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach(button => {
      button.onclick = () => {
        const targetTab = button.getAttribute('data-tab');
        
        // Remove active class from all buttons and panels
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanels.forEach(panel => panel.classList.remove('active'));
        
        // Add active class to clicked button and target panel
        button.classList.add('active');
        const targetPanel = document.getElementById(targetTab);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }
      };
    });
  }

  setupFileHandling() {
    // File input
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
      fileInput.onchange = (e) => {
        if (e.target.files.length > 0 && this.isConnected) {
          this.handleFileSelection(e.target.files);
        }
      };
    }

    // Select files button
    const selectFilesBtn = document.getElementById('selectFilesBtn');
    if (selectFilesBtn && fileInput) {
      selectFilesBtn.onclick = () => fileInput.click();
    }

    // Drag and drop
    const fileDropZone = document.getElementById('fileDropZone');
    if (fileDropZone) {
      fileDropZone.ondragover = (e) => {
        e.preventDefault();
        fileDropZone.classList.add('drag-over');
      };
      
      fileDropZone.ondragleave = () => {
        fileDropZone.classList.remove('drag-over');
      };
      
      fileDropZone.ondrop = (e) => {
        e.preventDefault();
        fileDropZone.classList.remove('drag-over');
        
        if (this.isConnected && e.dataTransfer.files.length > 0) {
          this.handleFileSelection(e.dataTransfer.files);
        }
      };
      
      // Make it clickable too
      fileDropZone.onclick = () => {
        if (fileInput) fileInput.click();
      };
    }
  }

  setupChat() {
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendMessage');

    if (sendBtn) {
      sendBtn.onclick = () => this.sendChatMessage();
    }

    if (messageInput) {
      messageInput.onkeypress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendChatMessage();
        }
      };

      messageInput.oninput = () => {
        // Enable/disable send button
        if (sendBtn) {
          sendBtn.disabled = !messageInput.value.trim();
        }
        
        // Send typing indicator
        this.sendTypingIndicator();
      };
    }

    // Initially disable send button
    if (sendBtn) {
      sendBtn.disabled = true;
    }
  }

  setupCalls() {
    // Video call button
    const videoCallBtn = document.getElementById('videoCallBtn');
    if (videoCallBtn) {
      videoCallBtn.onclick = () => this.startVideoCall();
    }

    // Voice call button
    const voiceCallBtn = document.getElementById('voiceCallBtn');
    if (voiceCallBtn) {
      voiceCallBtn.onclick = () => this.startVoiceCall();
    }

    // End call button
    const endCallBtn = document.getElementById('endCallBtn');
    if (endCallBtn) {
      endCallBtn.onclick = () => this.endCall();
    }

    // Mute button
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) {
      muteBtn.onclick = () => this.toggleMute();
    }

    // Video toggle button
    const videoToggleBtn = document.getElementById('videoToggleBtn');
    if (videoToggleBtn) {
      videoToggleBtn.onclick = () => this.toggleVideo();
    }
  }

  connectToPeer() {
    const peerInput = document.getElementById('peerCode');
    if (!peerInput) return;

    const peerCode = peerInput.value.trim().toUpperCase();
    
    if (!peerCode) {
      this.notify('Please enter a peer code', 'error');
      return;
    }
    
    if (peerCode.length !== 12) {
      this.notify('Peer code must be exactly 12 characters', 'error');
      return;
    }
    
    if (peerCode === this.myCode) {
      this.notify('Cannot connect to yourself', 'error');
      return;
    }

    if (!this.peer) {
      this.notify('Peer connection not ready', 'error');
      return;
    }

    // Send connection request via WebSocket
    this.sendWebSocketMessage({
      type: 'connect-request',
      targetCode: peerCode
    });

    this.updateStatus(`Connecting to ${peerCode}...`);

    // Initiate PeerJS connection
    try {
      this.connection = this.peer.connect(peerCode, {
        reliable: true,
        serialization: 'binary'
      });
      
      this.setupConnection(this.connection);
    } catch (error) {
      console.error('Connection error:', error);
      this.notify('Failed to connect', 'error');
    }
  }

  handleIncomingDataConnection(conn) {
    this.connection = conn;
    this.setupConnection(conn);
  }

  setupConnection(conn) {
    if (!conn) return;

    conn.on('open', () => {
      console.log('Data connection opened with:', conn.peer);
      this.isConnected = true;
      this.updateStatus('Connected! Ready to share files and chat.');
      
      // Switch to hub screen
      this.switchToHub(conn.peer);
    });

    conn.on('data', (data) => {
      this.handleReceivedData(data);
    });

    conn.on('close', () => {
      console.log('Data connection closed');
      this.isConnected = false;
      this.updateStatus('Connection closed');
      this.connection = null;
      this.switchToHome();
    });

    conn.on('error', (error) => {
      console.error('Data connection error:', error);
      this.isConnected = false;
      this.updateStatus('Connection error');
      this.connection = null;
      this.notify('Connection error: ' + error, 'error');
    });
  }

  switchToHub(peerId) {
    const homeScreen = document.getElementById('homeScreen');
    const hubScreen = document.getElementById('hubScreen');
    
    if (homeScreen && hubScreen) {
      homeScreen.classList.add('hidden');
      hubScreen.classList.remove('hidden');
    }

    // Update connected peer display
    const connectedPeerEl = document.getElementById('connectedPeerId');
    if (connectedPeerEl) {
      connectedPeerEl.textContent = `Connected to: ${peerId}`;
    }
  }

  switchToHome() {
    const homeScreen = document.getElementById('homeScreen');
    const hubScreen = document.getElementById('hubScreen');
    
    if (homeScreen && hubScreen) {
      hubScreen.classList.add('hidden');
      homeScreen.classList.remove('hidden');
    }
  }

  disconnect() {
    if (this.currentCall) {
      this.endCall();
    }
    
    if (this.connection) {
      this.connection.close();
    }
    
    this.isConnected = false;
    this.connection = null;
    this.updateStatus('Disconnected');
    this.switchToHome();
  }

  // File handling methods
  handleFileSelection(files) {
    if (!this.isConnected) {
      this.notify('No active connection', 'error');
      return;
    }

    Array.from(files).forEach(file => {
      this.sendFile(file);
    });
  }

  async sendFile(file) {
    if (!this.connection || !this.isConnected) {
      this.notify('No active connection', 'error');
      return;
    }

    try {
      const transferId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      
      // Send file metadata
      const metadata = {
        type: 'file-metadata',
        transferId: transferId,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        lastModified: file.lastModified
      };

      this.connection.send(metadata);
      this.updateStatus(`Sending ${file.name}...`);

      // Send file data in chunks
      const CHUNK_SIZE = 16 * 1024; // 16KB chunks
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        const arrayBuffer = await chunk.arrayBuffer();

        const chunkData = {
          type: 'file-chunk',
          transferId: transferId,
          chunkIndex: i,
          totalChunks: totalChunks,
          data: arrayBuffer,
          isLastChunk: i === totalChunks - 1
        };

        this.connection.send(chunkData);
        
        // Update progress
        const progress = ((i + 1) / totalChunks * 100).toFixed(1);
        this.updateProgressUI(progress);
      }

      this.updateStatus(`${file.name} sent successfully!`);
      this.notify('File sent successfully', 'success');
    } catch (error) {
      console.error('File send error:', error);
      this.notify('Failed to send file', 'error');
    }
  }

  handleReceivedData(data) {
    if (!data || typeof data !== 'object') return;

    switch (data.type) {
      case 'file-metadata':
        this.handleFileMetadata(data);
        break;
      case 'file-chunk':
        this.handleFileChunk(data);
        break;
      case 'chat':
        this.handleChatMessage(data);
        break;
      case 'typing':
        this.handleTypingIndicator();
        break;
      default:
        console.log('Unknown data type:', data.type);
    }
  }

  handleFileMetadata(metadata) {
    this.currentFileTransfer = {
      transferId: metadata.transferId,
      name: metadata.name,
      size: metadata.size,
      mimeType: metadata.mimeType,
      chunks: [],
      receivedChunks: 0
    };

    this.updateStatus(`Receiving ${metadata.name}...`);
    this.updateTransferCard('Downloading', metadata.name);
  }

  handleFileChunk(chunkData) {
    if (!this.currentFileTransfer || this.currentFileTransfer.transferId !== chunkData.transferId) {
      return;
    }

    // Store chunk
    this.currentFileTransfer.chunks[chunkData.chunkIndex] = new Uint8Array(chunkData.data);
    this.currentFileTransfer.receivedChunks++;

    // Update progress
    const progress = (this.currentFileTransfer.receivedChunks / chunkData.totalChunks * 100).toFixed(1);
    this.updateProgressUI(progress);
    this.updateStatus(`Receiving ${this.currentFileTransfer.name}: ${progress}%`);

    // If last chunk, assemble and download file
    if (chunkData.isLastChunk) {
      this.assembleAndDownloadFile();
    }
  }

  assembleAndDownloadFile() {
    if (!this.currentFileTransfer) return;

    try {
      const blob = new Blob(this.currentFileTransfer.chunks, {
        type: this.currentFileTransfer.mimeType || 'application/octet-stream'
      });

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.currentFileTransfer.name;
      a.style.display = 'none';
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      this.updateStatus(`${this.currentFileTransfer.name} received successfully!`);
      this.notify('File received successfully', 'success');
      this.updateTransferCard('Downloaded', this.currentFileTransfer.name);
      this.addToTransferHistory(this.currentFileTransfer);
      
    } catch (error) {
      console.error('File assembly error:', error);
      this.notify('Failed to download file', 'error');
    } finally {
      this.currentFileTransfer = null;
    }
  }

  // Chat methods
  sendChatMessage() {
    const messageInput = document.getElementById('messageInput');
    if (!messageInput) return;

    const message = messageInput.value.trim();
    if (!message || !this.isConnected || !this.connection) return;

    try {
      const chatData = {
        type: 'chat',
        message: message,
        timestamp: Date.now()
      };

      this.connection.send(chatData);
      this.addChatMessage(message, true, chatData.timestamp);
      messageInput.value = '';
      
      // Disable send button until new input
      const sendBtn = document.getElementById('sendMessage');
      if (sendBtn) sendBtn.disabled = true;

    } catch (error) {
      console.error('Chat send error:', error);
      this.notify('Failed to send message', 'error');
    }
  }

  handleChatMessage(data) {
    this.addChatMessage(data.message, false, data.timestamp);
    this.hideTypingIndicator();
  }

  addChatMessage(message, isSent, timestamp) {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;

    // Remove welcome message if present
    const welcomeMessage = messagesContainer.querySelector('.welcome-message');
    if (welcomeMessage) {
      welcomeMessage.remove();
    }

    const messageEl = document.createElement('div');
    messageEl.className = `message ${isSent ? 'sent' : 'received'}`;

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.textContent = message;

    const messageTime = document.createElement('div');
    messageTime.className = 'message-time';
    messageTime.textContent = new Date(timestamp).toLocaleTimeString();

    messageEl.appendChild(messageContent);
    messageEl.appendChild(messageTime);
    messagesContainer.appendChild(messageEl);

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  sendTypingIndicator() {
    if (!this.connection || !this.isConnected) return;

    const now = Date.now();
    if (now - this.lastTypingSentAt < 1000) return; // Throttle

    this.lastTypingSentAt = now;
    
    try {
      this.connection.send({
        type: 'typing',
        timestamp: now
      });
    } catch (error) {
      console.error('Typing indicator error:', error);
    }
  }

  handleTypingIndicator() {
    this.showTypingIndicator();
    
    // Hide after 2 seconds
    if (this.typingTimeoutId) {
      clearTimeout(this.typingTimeoutId);
    }
    
    this.typingTimeoutId = setTimeout(() => {
      this.hideTypingIndicator();
    }, 2000);
  }

  showTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
      indicator.classList.remove('hidden');
    }
  }

  hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
      indicator.classList.add('hidden');
    }
  }

  // Call methods
  async startVideoCall() {
    if (!this.isConnected) {
      this.notify('No active connection', 'error');
      return;
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      this.isVideoCall = true;
      this.callState = 'calling';
      this.updateCallUI();

      const call = this.peer.call(this.connection.peer, this.localStream);
      this.setupCall(call);
    } catch (error) {
      console.error('Video call error:', error);
      this.notify('Failed to start video call', 'error');
    }
  }

  async startVoiceCall() {
    if (!this.isConnected) {
      this.notify('No active connection', 'error');
      return;
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true
      });

      this.isVideoCall = false;
      this.callState = 'calling';
      this.updateCallUI();

      const call = this.peer.call(this.connection.peer, this.localStream);
      this.setupCall(call);
    } catch (error) {
      console.error('Voice call error:', error);
      this.notify('Failed to start voice call', 'error');
    }
  }

  async handleIncomingCall(call) {
    if (this.currentCall) {
      call.close();
      return;
    }

    const accept = confirm(`Incoming ${call.metadata?.video ? 'video' : 'voice'} call. Accept?`);
    
    if (accept) {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: call.metadata?.video || false,
          audio: true
        });

        this.isVideoCall = call.metadata?.video || false;
        this.callState = 'connected';
        
        call.answer(this.localStream);
        this.setupCall(call);
        this.updateCallUI();
      } catch (error) {
        console.error('Call answer error:', error);
        call.close();
        this.notify('Failed to answer call', 'error');
      }
    } else {
      call.close();
    }
  }

  setupCall(call) {
    this.currentCall = call;

    call.on('stream', (remoteStream) => {
      this.remoteStream = remoteStream;
      this.callState = 'connected';
      this.updateCallUI();
      this.playRemoteStream(remoteStream);
    });

    call.on('close', () => {
      this.endCall();
    });

    call.on('error', (error) => {
      console.error('Call error:', error);
      this.endCall();
      this.notify('Call error', 'error');
    });
  }

  playRemoteStream(stream) {
    const remoteVideo = document.getElementById('remoteVideo');
    const remoteAudio = document.getElementById('remoteAudio');

    if (this.isVideoCall && remoteVideo) {
      remoteVideo.srcObject = stream;
      remoteVideo.play();
    } else if (remoteAudio) {
      remoteAudio.srcObject = stream;
      remoteAudio.play();
    }

    // Also play local stream
    const localVideo = document.getElementById('localVideo');
    if (this.localStream && localVideo && this.isVideoCall) {
      localVideo.srcObject = this.localStream;
      localVideo.play();
    }
  }

  endCall() {
    if (this.currentCall) {
      this.currentCall.close();
      this.currentCall = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    this.remoteStream = null;
    this.callState = 'idle';
    this.isVideoCall = false;
    this.isMuted = false;
    this.isVideoOff = false;

    // Clear video elements
    const remoteVideo = document.getElementById('remoteVideo');
    const localVideo = document.getElementById('localVideo');
    const remoteAudio = document.getElementById('remoteAudio');

    if (remoteVideo) remoteVideo.srcObject = null;
    if (localVideo) localVideo.srcObject = null;
    if (remoteAudio) remoteAudio.srcObject = null;

    this.updateCallUI();
  }

  toggleMute() {
    if (!this.localStream) return;

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      this.isMuted = !audioTrack.enabled;
      this.updateCallUI();
    }
  }

  toggleVideo() {
    if (!this.localStream || !this.isVideoCall) return;

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      this.isVideoOff = !videoTrack.enabled;
      this.updateCallUI();
    }
  }

  updateCallUI() {
    // Update call control buttons based on call state
    const videoCallBtn = document.getElementById('videoCallBtn');
    const voiceCallBtn = document.getElementById('voiceCallBtn');
    const endCallBtn = document.getElementById('endCallBtn');
    const muteBtn = document.getElementById('muteBtn');
    const videoToggleBtn = document.getElementById('videoToggleBtn');
    const activeCallControls = document.querySelector('.active-call-controls');

    if (videoCallBtn) videoCallBtn.disabled = this.callState !== 'idle';
    if (voiceCallBtn) voiceCallBtn.disabled = this.callState !== 'idle';
    
    if (activeCallControls) {
      activeCallControls.style.display = this.callState !== 'idle' ? 'flex' : 'none';
    }
    
    if (muteBtn) {
      muteBtn.style.display = this.callState === 'connected' ? 'block' : 'none';
      muteBtn.textContent = this.isMuted ? 'Unmute' : 'Mute';
    }
    
    if (videoToggleBtn) {
      videoToggleBtn.style.display = this.callState === 'connected' && this.isVideoCall ? 'block' : 'none';
      videoToggleBtn.textContent = this.isVideoOff ? 'Video On' : 'Video Off';
    }

    // Show/hide video containers
    const videoContainer = document.getElementById('videoContainer');
    const voiceContainer = document.getElementById('voiceContainer');

    if (videoContainer) {
      videoContainer.style.display = this.callState === 'connected' && this.isVideoCall ? 'block' : 'none';
    }
    
    if (voiceContainer) {
      voiceContainer.style.display = this.callState === 'connected' && !this.isVideoCall ? 'block' : 'none';
    }
  }

  // UI utility methods
  updateStatus(message) {
    console.log('Status:', message);
    
    const statusElements = [
      document.getElementById('status'),
      document.querySelector('.connection-status span')
    ];

    statusElements.forEach(el => {
      if (el) el.textContent = message;
    });

    // Update status indicator
    const indicator = document.querySelector('.status-indicator');
    if (indicator) {
      indicator.classList.remove('waiting', 'connected', 'error');
      
      if (message.toLowerCase().includes('error') || message.toLowerCase().includes('failed')) {
        indicator.classList.add('error');
      } else if (message.toLowerCase().includes('connected') || message.toLowerCase().includes('ready')) {
        indicator.classList.add('connected');
      } else {
        indicator.classList.add('waiting');
      }
    }
  }

  updateProgressUI(percentage) {
    const progressFill = document.getElementById('progressFill');
    const progressPercent = document.getElementById('progressPercent');

    if (progressFill) {
      progressFill.style.width = `${percentage}%`;
    }
    
    if (progressPercent) {
      progressPercent.textContent = `${Math.round(percentage)}%`;
    }
  }

  updateTransferCard(action, fileName) {
    const actionEl = document.getElementById('transferAction');
    const fileNameEl = document.getElementById('transferFileName');

    if (actionEl) actionEl.textContent = action;
    if (fileNameEl) fileNameEl.textContent = fileName;
  }

  addToTransferHistory(fileData) {
    const historyContainer = document.getElementById('transferHistory');
    if (!historyContainer) return;

    // Remove empty state
    const emptyState = historyContainer.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `
      <div class="file-icon">FILE</div>
      <div class="file-info">
        <div class="file-name">${fileData.name}</div>
        <div class="file-size">${this.formatFileSize(fileData.size)} • ${new Date().toLocaleTimeString()}</div>
      </div>
    `;

    historyContainer.insertBefore(item, historyContainer.firstChild);
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  notify(message, type = 'info') {
    const container = document.getElementById('notifications');
    if (!container) {
      // Fallback to alert if no notification container
      alert(message);
      return;
    }

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    container.appendChild(notification);

    // Auto remove after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  initializeQRCode() {
    const qrElement = document.getElementById('qrCode');
    if (qrElement) {
      qrElement.innerHTML = '<div class="qr-placeholder">Connecting to network...</div>';
    }
  }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.p2pApp = new P2PFileShare();
});