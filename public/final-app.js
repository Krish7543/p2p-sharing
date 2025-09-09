class P2PFileShare {
  constructor() {
    this.peer = null;
    this.ws = null;
    this.myCode = '';
    this.isConnected = false;
    
    this.dataChannels = [];
    this.NUM_CHANNELS = 5; // Decreased from 50
    this.channelsReady = 0;

    // File transfer state
    this.fileTransfers = {};
    
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
        case 'file-transfer-confirmed':
          const confirmedTransferId = message.transferId;
          const confirmedTransfer = this.fileTransfers[confirmedTransferId];
          if (confirmedTransfer) {
            this.notify(`File ${confirmedTransfer.file.name} confirmed by receiver!`, 'success');
            this.addToTransferHistory(confirmedTransfer.file); // Add to sender's history
            delete this.fileTransfers[confirmedTransferId]; // Now delete from active transfers
            // Update UI to reflect no active transfers if this was the last one
            if (Object.keys(this.fileTransfers).length === 0) {
                this.updateTransferCard('Ready', 'No active transfers');
                this.updateProgressUI(0);
            }
          } else {
            console.warn(`Sender: Received confirmation for unknown transfer ID: ${confirmedTransferId}`);
            this.notify(`Transfer confirmed for ID ${confirmedTransferId}`, 'success'); // Still notify
          }
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
    const modal = document.getElementById('connectionRequestModal');
    const codeSpan = document.getElementById('connectionRequestCode');
    
    if (modal && codeSpan) {
        codeSpan.textContent = fromCode;
        modal.classList.remove('hidden');
        modal.dataset.fromCode = fromCode;
    }
  }

  handleConnectionDecision(accepted) {
    const modal = document.getElementById('connectionRequestModal');
    if (!modal) return;

    const fromCode = modal.dataset.fromCode;
    if (!fromCode) return;

    if (accepted) {
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

    modal.classList.add('hidden');
    delete modal.dataset.fromCode;
  }

  handleConnectionAccepted(fromCode) {
    this.updateStatus(`Connection accepted by ${fromCode}. Establishing P2P...`);
    
    for (let i = 0; i < this.NUM_CHANNELS; i++) {
        const conn = this.peer.connect(fromCode, {
            label: `ft_${i}`,
            reliable: true,
            serialization: 'binary'
        });
        this.setupDataChannel(conn);
    }
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
        this.setupDataChannel(conn);
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

    // Connection Modal Buttons
    const acceptBtn = document.getElementById('acceptConnectionBtn');
    const rejectBtn = document.getElementById('rejectConnectionBtn');

    if (acceptBtn) {
        acceptBtn.onclick = () => this.handleConnectionDecision(true);
    }
    if (rejectBtn) {
        rejectBtn.onclick = () => this.handleConnectionDecision(false);
    }
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

    this.updateStatus(`Requesting connection to ${peerCode}...`);
  }

  setupDataChannel(conn) {
    conn.on('open', () => {
        this.dataChannels.push(conn);
        this.dataChannels.sort((a, b) => a.label.localeCompare(b.label));
        
        if (this.dataChannels.length === this.NUM_CHANNELS) {
            this.isConnected = true;
            this.updateStatus('Connected! Ready to share files.');
            this.switchToHub(this.dataChannels[0].peer);
        }
    });

    conn.on('data', (data) => {
        this.handleReceivedData(data);
    });

    conn.on('close', () => {
        this.disconnect();
    });

    conn.on('error', (error) => {
        console.error('Data channel error:', error);
        this.disconnect();
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
    this.dataChannels.forEach(channel => {
        if (channel) channel.close();
    });
    this.dataChannels = [];
    this.channelsReady = 0;
    this.isConnected = false;
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
    if (!this.isConnected) {
      this.notify('No active connection', 'error');
      return;
    }

    const transferId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const CHUNK_SIZE = 256 * 1024;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    this.fileTransfers[transferId] = {
        file: file,
        transferId: transferId,
        chunkSize: CHUNK_SIZE,
        totalChunks: totalChunks,
        nextChunkIndex: 0,
        chunksAcked: new Set(),
        windowSize: 16, // Reverted to 16
        inFlight: 0,
        startTime: Date.now(),
        bytesAcked: 0,
        retransmits: {},
        status: 'sending', // Add status
        // RTT/RTO related properties
        sendTimes: {}, // To store send time of each chunk
        estimatedRTT: 5000, // Initial RTT estimate (5 seconds)
        devRTT: 0,
        retransmissionTimeout: 5000, // Initial RTO (5 seconds)
        alpha: 0.125, // For RTT estimation (TCP's alpha)
        beta: 0.25,   // For RTT estimation (TCP's beta)
        minRTO: 1000, // Minimum RTO (1 second)
        maxRTO: 60000, // Maximum RTO (60 seconds)
        // Congestion Control related properties
        congestionWindow: 1, // Initial congestion window (in chunks)
        slowStartThreshold: Infinity, // Initially no threshold, always slow start
        duplicateAcks: 0,
        lastAckedChunkIndex: -1, // Highest chunk index acknowledged so far
        ssthresh: 64 // Initial slow start threshold (arbitrary, can be tuned)
    };

    const metadata = {
        type: 'file-metadata',
        transferId: transferId,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        lastModified: file.lastModified,
        totalChunks: totalChunks
    };

    this.dataChannels[0].send(metadata);
    this.updateStatus(`Starting transfer of ${file.name}...`);

    this.sendNextChunk(transferId);
  }

  sendNextChunk(transferId) {
      const transfer = this.fileTransfers[transferId];
      if (!transfer) return;

      // Only send if inFlight is less than congestionWindow
      while (transfer.inFlight < Math.floor(transfer.congestionWindow) && transfer.nextChunkIndex < transfer.totalChunks) {
          this.sendChunk(transferId, transfer.nextChunkIndex);
          transfer.nextChunkIndex++;
      }
  }

  async sendChunk(transferId, chunkIndex) {
      const transfer = this.fileTransfers[transferId];
      if (!transfer || transfer.chunksAcked.has(chunkIndex)) {
          return;
      }

      const start = chunkIndex * transfer.chunkSize;
      const end = Math.min(start + transfer.chunkSize, transfer.file.size);
      const chunk = transfer.file.slice(start, end);
      const arrayBuffer = await chunk.arrayBuffer();

      const chunkData = {
          type: 'file-chunk',
          transferId: transferId,
          chunkIndex: chunkIndex,
          data: arrayBuffer
      };

      const channelIndex = chunkIndex % this.NUM_CHANNELS;
      this.dataChannels[channelIndex].send(chunkData);
      transfer.inFlight++;
      transfer.sendTimes[chunkIndex] = Date.now(); // Store send time

      transfer.retransmits[chunkIndex] = setTimeout(() => {
          console.log(`Chunk ${chunkIndex} timed out, retransmitting...`);
          transfer.inFlight--;
          this.sendChunk(transferId, chunkIndex);
      }, transfer.retransmissionTimeout); // Use dynamic RTO
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
      case 'file-chunk-ack':
        this.handleFileChunkAck(data);
        break;
      default:
        console.log('Unknown data type:', data.type);
    }
  }

  handleFileChunkAck(ackData) {
      const { transferId, chunkIndex } = ackData;
      const transfer = this.fileTransfers[transferId];
      if (!transfer) return;

      // If this chunk has already been acknowledged, it's a duplicate ACK
      if (transfer.chunksAcked.has(chunkIndex)) {
          // Handle duplicate ACKs for Fast Retransmit
          if (chunkIndex === transfer.lastAckedChunkIndex) { // Only count duplicate ACKs for the highest acknowledged chunk
              transfer.duplicateAcks++;
              if (transfer.duplicateAcks === 3) { // Three duplicate ACKs trigger Fast Retransmit
                  console.log(`Fast Retransmit triggered for chunk ${chunkIndex + 1}`);
                  // Retransmit the next expected chunk (chunkIndex + 1)
                  // This assumes chunkIndex is the highest acknowledged, and we need the next one
                  // For simplicity, we'll retransmit the chunk that is likely lost (chunkIndex + 1)
                  // We need to ensure we don't retransmit a chunk that is already in flight or acknowledged
                  const nextExpectedChunk = chunkIndex + 1;
                  if (!transfer.chunksAcked.has(nextExpectedChunk) && !transfer.retransmits[nextExpectedChunk]) {
                      this.sendChunk(transferId, nextExpectedChunk);
                  }
                  // Enter Fast Recovery: halve congestion window, set ssthresh
                  transfer.ssthresh = Math.max(Math.floor(transfer.congestionWindow / 2), 1);
                  transfer.congestionWindow = transfer.ssthresh + 3; // cwnd = ssthresh + 3 * MSS
              } else if (transfer.duplicateAcks > 3) {
                  transfer.congestionWindow++; // Inflate window for each additional duplicate ACK
              }
          }
          return; // Already acknowledged, no further processing for this chunk
      }

      // This is a new ACK
      clearTimeout(transfer.retransmits[chunkIndex]);
      delete transfer.retransmits[chunkIndex];
      delete transfer.sendTimes[chunkIndex]; // Clean up send time

      transfer.inFlight--;
      transfer.chunksAcked.add(chunkIndex);
      transfer.bytesAcked += transfer.chunkSize;

      // Update lastAckedChunkIndex
      if (chunkIndex > transfer.lastAckedChunkIndex) {
          transfer.lastAckedChunkIndex = chunkIndex;
      }

      // Reset duplicate ACKs
      transfer.duplicateAcks = 0;

      // --- DRTO Calculation ---
      const sampleRTT = Date.now() - transfer.sendTimes[chunkIndex]; // Use original send time for RTT
      if (sampleRTT < 0) { // Should not happen, but for safety
          console.warn(`Negative sampleRTT for chunk ${chunkIndex}. Ignoring.`);
      } else {
          if (transfer.estimatedRTT === 5000 && transfer.devRTT === 0) { // First sample
              transfer.estimatedRTT = sampleRTT;
              transfer.devRTT = sampleRTT / 2;
          } else {
              transfer.estimatedRTT = (1 - transfer.alpha) * transfer.estimatedRTT + transfer.alpha * sampleRTT;
              transfer.devRTT = (1 - transfer.beta) * transfer.devRTT + transfer.beta * Math.abs(sampleRTT - transfer.estimatedRTT);
          }
          transfer.retransmissionTimeout = Math.max(transfer.minRTO, Math.min(transfer.maxRTO, transfer.estimatedRTT + 4 * transfer.devRTT));
      }
      // --- End DRTO Calculation ---

      // --- Congestion Control (Slow Start / Congestion Avoidance) ---
      if (transfer.congestionWindow < transfer.ssthresh) {
          // Slow Start: Increase cwnd by 1 for each new ACK
          transfer.congestionWindow++;
      } else {
          // Congestion Avoidance: Increase cwnd by 1/cwnd for each new ACK
          transfer.congestionWindow += 1 / transfer.congestionWindow;
      }
      // --- End Congestion Control ---

      const totalTimeElapsed = (Date.now() - transfer.startTime) / 1000;
      if (totalTimeElapsed > 0) {
          const averageSpeed = (transfer.bytesAcked / totalTimeElapsed) / (1024 * 1024);
          this.updateSpeedUI(averageSpeed);
      }

      const progress = (transfer.chunksAcked.size / transfer.totalChunks * 100).toFixed(1);
      this.updateProgressUI(progress);

      if (transfer.chunksAcked.size === transfer.totalChunks) {
          transfer.status = 'sent_awaiting_confirmation';
          this.updateStatus(`${transfer.file.name} sent. Awaiting receiver confirmation...`);
          this.notify('File sent, awaiting confirmation', 'info');
          this.updateSpeedUI(0);
      } else {
          this.sendNextChunk(transferId); // Try to send more chunks if window allows
      }
  }

  handleFileMetadata(metadata) {
    this.fileTransfers[metadata.transferId] = {
      transferId: metadata.transferId,
      name: metadata.name,
      size: metadata.size,
      mimeType: metadata.mimeType,
      chunks: [],
      receivedChunks: 0,
      receivedChunkIndices: new Set(), // Initialize as a Set
      totalChunks: metadata.totalChunks
    };

    this.updateStatus(`Receiving ${metadata.name}...`);
    this.updateTransferCard('Downloading', metadata.name);
  }

  handleFileChunk(chunkData) {
    const transfer = this.fileTransfers[chunkData.transferId];
    if (!transfer) {
      console.error(`Receiver: Transfer state not found for chunk ${chunkData.chunkIndex} of transfer ${chunkData.transferId}`);
      return;
    }

    // Store the chunk
    transfer.chunks[chunkData.chunkIndex] = new Uint8Array(chunkData.data);
    
    // Only add to set and increment if it's a new chunk
    if (!transfer.receivedChunkIndices.has(chunkData.chunkIndex)) {
        transfer.receivedChunkIndices.add(chunkData.chunkIndex);
        console.log(`Receiver: New chunk ${chunkData.chunkIndex} received. Total unique received: ${transfer.receivedChunkIndices.size}/${transfer.totalChunks}`);
    } else {
        console.log(`Receiver: Duplicate chunk ${chunkData.chunkIndex} received. Total unique received: ${transfer.receivedChunkIndices.size}/${transfer.totalChunks}`);
    }

    this.dataChannels[0].send({
        type: 'file-chunk-ack',
        transferId: chunkData.transferId,
        chunkIndex: chunkData.chunkIndex
    });

    const progress = (transfer.receivedChunkIndices.size / transfer.totalChunks * 100).toFixed(1);
    this.updateProgressUI(progress);
    this.updateStatus(`Receiving ${transfer.name}: ${progress}%`);

    if (transfer.receivedChunkIndices.size === transfer.totalChunks) {
      console.log(`Receiver: All chunks received for ${transfer.name}. Assembling file.`);
      this.assembleAndDownloadFile(chunkData.transferId);
    }
  }

  assembleAndDownloadFile(transferId) {
    const transfer = this.fileTransfers[transferId];
    if (!transfer) return;

    try {
      const blob = new Blob(transfer.chunks, {
        type: transfer.mimeType || 'application/octet-stream'
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = transfer.name;
      a.style.display = 'none';
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      this.updateStatus(`${transfer.name} received successfully!`);
      this.notify('File received successfully', 'success');
      this.updateTransferCard('Downloaded', transfer.name);
      this.addToTransferHistory(transfer);
      
      // Reset progress UI after successful transfer
      this.updateProgressUI(0);
      this.updateTransferCard('Ready', 'No active transfers');

      // Send confirmation to the sender via WebSocket
      this.sendWebSocketMessage({
        type: 'file-transfer-confirmed',
        transferId: transferId,
        targetCode: this.dataChannels[0].peer // Assuming dataChannels[0] is connected to the sender
      });

    } catch (error) {
      console.error('File assembly error:', error);
      this.notify('Failed to download file', 'error');
    } finally {
      delete this.fileTransfers[transferId];
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

  updateSpeedUI(speed) {
    const speedEl = document.getElementById('transferSpeed');
    if (speedEl) {
        if (speed > 1) { // If speed is > 1 MB/s, show in MB/s
            speedEl.textContent = `${speed.toFixed(2)} MB/s`;
        } else { // Otherwise show in KB/s
            speedEl.textContent = `${(speed * 1024).toFixed(1)} KB/s`;
        }
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