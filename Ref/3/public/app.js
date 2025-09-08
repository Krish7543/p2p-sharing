class P2PFileShare {
  constructor() {
    this.peer = null;
    this.connection = null;
    this.ws = null;
    this.myCode = '';
    this.isConnected = false;
    // Ack synchronization state
    this.pendingAcks = {};
    // Cached UI refs
    this.ui = {};
    this.lastTypingSentAt = 0;
    this.typingTimeoutId = null;
    this.init();
  }

  init() {
    this.initializeWebSocket();
    this.setupUI();
  }

  initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}`);

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'your-code') {
          this.myCode = message.code;
          // Support old and new UIs
          const oldCode = document.getElementById('myCode');
          if (oldCode) oldCode.textContent = message.code;
          const newCode = document.getElementById('connectionCode');
          if (newCode) newCode.textContent = message.code;
          const copyBtn = document.getElementById('copyCode');
          if (copyBtn) {
            copyBtn.disabled = false;
            copyBtn.onclick = async () => {
              try {
                await navigator.clipboard.writeText(this.myCode);
                this.notify('Code copied to clipboard');
              } catch (_) {}
            };
          }
          // Enable peer input if present and normalize to 12-char
          const peerInput = document.getElementById('peerCode');
          const connectBtn = document.getElementById('connectBtn');
          if (peerInput) {
            peerInput.disabled = false;
            peerInput.setAttribute('maxlength', '12');
            if (peerInput.placeholder && peerInput.placeholder.includes('8')) {
              peerInput.placeholder = 'Enter 12-character code';
            }
          }
          if (connectBtn) connectBtn.disabled = false;
          // Update server endpoint label if present
          const endpoint = document.getElementById('serverEndpoint');
          if (endpoint) endpoint.textContent = `${protocol}//${location.host}`;
          const serverStatus = document.getElementById('serverStatus');
          if (serverStatus) serverStatus.classList.add('connected');
          this.initializePeerJS();
        }
      } catch (error) {
        console.error('WebSocket error:', error);
      }
    };

    this.ws.onclose = () => {
      this.updateStatus('Disconnected from server');
    };
  }

  initializePeerJS() {
    this.peer = new Peer(this.myCode, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    this.peer.on('open', (id) => {
      console.log('PeerJS ready with ID:', id);
      this.updateStatus('Ready to connect!');
    });

    this.peer.on('connection', (conn) => {
      console.log('Incoming connection from:', conn.peer);
      this.handleIncomingConnection(conn);
    });

    this.peer.on('error', (error) => {
      console.error('PeerJS error:', error);
      this.updateStatus('Connection error: ' + error.type);
    });
  }

  setupUI() {
    // Connect button (new + old UI)
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
      connectBtn.onclick = () => {
        const peerInput = document.getElementById('peerCode');
        const peerCode = (peerInput?.value || '').trim().toUpperCase();
        if (peerCode && peerCode.length === 12 && peerCode !== this.myCode) {
          this.connectToPeer(peerCode);
        } else {
          alert('Please enter a valid 12-character code');
        }
      };
    }

    // Disconnect button
    const disconnectBtn = document.getElementById('disconnectBtn');
    if (disconnectBtn) {
      disconnectBtn.onclick = () => this.disconnect();
    }

    // Enter key support
    const peerInput = document.getElementById('peerCode');
    if (peerInput) {
      peerInput.onkeypress = (e) => {
        if (e.key === 'Enter') {
          connectBtn?.click();
        }
      };
    }

    // File input - SUPPORT BOTH FILES AND FOLDERS
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
      fileInput.onchange = (e) => {
        if (e.target.files.length > 0 && this.isConnected) {
          this.handleFileSelection(e.target.files);
        }
      };
    }

    // New UI select files button triggers hidden input
    const selectFilesBtn = document.getElementById('selectFilesBtn');
    if (selectFilesBtn && fileInput) {
      selectFilesBtn.onclick = () => fileInput.click();
    }

    // Attach file in chat opens file selector too (optional UX)
    const attachBtn = document.getElementById('attachFile');
    if (attachBtn && fileInput) {
      attachBtn.onclick = () => fileInput.click();
    }

    // Chat handlers
    const sendBtn = document.getElementById('sendMessage');
    const messageInput = document.getElementById('messageInput');
    if (sendBtn && messageInput) {
      sendBtn.onclick = () => this.sendChatMessage();
      messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.sendChatMessage();
        }
      });
      messageInput.addEventListener('input', () => this.sendTyping());
    }

    // Drag and drop - support old (#dropZone) and new (#fileDropZone)
    const dropZone = document.getElementById('dropZone') || document.getElementById('fileDropZone');
    if (dropZone) {
      dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      };
      dropZone.ondragleave = () => {
        dropZone.classList.remove('drag-over');
      };
      dropZone.ondrop = async (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (this.isConnected) {
          const items = e.dataTransfer?.items;
          if (items) await this.handleDroppedItems(items);
          else if (e.dataTransfer?.files?.length) this.handleFileSelection(e.dataTransfer.files);
        }
      };
    }

    // Add folder selection button
    this.addFolderButton();
  }

  addFolderButton() {
    const fileSection = document.querySelector('.file-section .drop-content') || document.querySelector('#fileDropZone .drop-content');
    const folderInput = document.createElement('input');
    folderInput.type = 'file';
    folderInput.id = 'folderInput';
    folderInput.webkitdirectory = true;
    folderInput.style.display = 'none';

    const folderButton = document.createElement('label');
    folderButton.htmlFor = 'folderInput';
    folderButton.className = 'file-button';
    folderButton.style.backgroundColor = '#17a2b8';
    folderButton.style.marginLeft = '10px';
    folderButton.textContent = 'Choose Folder';

    folderInput.onchange = (e) => {
      if (e.target.files.length > 0 && this.isConnected) {
        this.handleFileSelection(e.target.files);
      }
    };

    fileSection.appendChild(folderInput);
    fileSection.appendChild(folderButton);
  }

  async handleDroppedItems(items) {
    const files = [];
    
    for (let item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          await this.traverseFileTree(entry, '', files);
        }
      }
    }
    
    if (files.length > 0) {
      this.handleFileSelection(files);
    }
  }

  async traverseFileTree(item, path, files) {
    return new Promise((resolve) => {
      if (item.isFile) {
        item.file((file) => {
          file.relativePath = path + file.name;
          files.push(file);
          resolve();
        });
      } else if (item.isDirectory) {
        const dirReader = item.createReader();
        dirReader.readEntries(async (entries) => {
          for (let entry of entries) {
            await this.traverseFileTree(entry, path + item.name + '/', files);
          }
          resolve();
        });
      }
    });
  }

  handleFileSelection(files) {
    if (files.length === 1) {
      this.sendFile(files[0]);
    } else {
      this.sendMultipleFiles(files);
    }
  }

  async sendMultipleFiles(files) {
    this.updateStatus(`Sending ${files.length} files...`);
    
    // Send batch metadata
    this.connection.send({
      type: 'batch-start',
      fileCount: files.length
    });

    for (let i = 0; i < files.length; i++) {
      await this.sendFile(files[i], i + 1, files.length);
      // Small delay between files
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.connection.send({
      type: 'batch-complete'
    });

    this.updateStatus(`✅ All ${files.length} files sent successfully!`);
  }

  connectToPeer(peerCode) {
    if (!this.peer) {
      alert('PeerJS not ready yet, please wait...');
      return;
    }

    this.updateStatus(`Connecting to ${peerCode}...`);
    
    this.connection = this.peer.connect(peerCode, {
      reliable: true,
      serialization: 'binary'
    });

    this.setupConnection(this.connection);
  }

  handleIncomingConnection(conn) {
    const accept = confirm(`Accept file sharing connection from ${conn.peer}?`);
    
    if (accept) {
      this.connection = conn;
      this.setupConnection(conn);
      this.updateStatus('Connection accepted!');
    } else {
      conn.close();
    }
  }

  setupConnection(conn) {
    conn.on('open', () => {
      console.log('Connection opened with:', conn.peer);
      this.isConnected = true;
      this.updateStatus('✅ Connected! Ready to share files.');
      const fileInput = document.getElementById('fileInput');
      if (fileInput) fileInput.disabled = false;
      // Switch to hub screen if present
      const home = document.getElementById('homeScreen');
      const hub = document.getElementById('hubScreen');
      if (home && hub) {
        home.classList.add('hidden');
        hub.classList.remove('hidden');
      }
      const connectedPeer = document.getElementById('connectedPeerId');
      if (connectedPeer) connectedPeer.textContent = `Connected to: ${conn.peer}`;
    });

    conn.on('data', (data) => {
      // Route ACK messages to ack handler to synchronize sender/receiver
      if (data && data.type === 'ack') {
        this.handleAck(data);
        return;
      }
      // Chat & typing messages
      if (data && (data.type === 'chat' || data.type === 'typing')) {
        this.handleChatReceive(data);
        return;
      }
      this.handleFileReceive(data);
    });

    conn.on('close', () => {
      console.log('Connection closed');
      this.isConnected = false;
      const fileInput = document.getElementById('fileInput');
      if (fileInput) fileInput.disabled = true;
      this.updateStatus('Connection closed');
      this.connection = null;
      // Return to home if present
      const home = document.getElementById('homeScreen');
      const hub = document.getElementById('hubScreen');
      if (home && hub) {
        hub.classList.add('hidden');
        home.classList.remove('hidden');
      }
    });

    conn.on('error', (error) => {
      console.error('Connection error:', error);
      this.updateStatus('❌ Connection error');
      this.isConnected = false;
      const fileInput = document.getElementById('fileInput');
      if (fileInput) fileInput.disabled = true;
      this.connection = null;
    });
  }

  disconnect() {
    try {
      if (this.connection) {
        this.connection.close();
      }
    } catch (_) {}
  }

  sendChatMessage() {
    const input = document.getElementById('messageInput');
    if (!input) return;
    const text = (input.value || '').trim();
    if (!text || !this.connection || !this.isConnected) return;
    const payload = { type: 'chat', message: text, timestamp: Date.now() };
    try {
      this.connection.send(payload);
      this.appendChatMessage({ text, own: true, timestamp: payload.timestamp });
      input.value = '';
    } catch (err) {
      console.error('Chat send failed', err);
    }
  }

  sendTyping() {
    if (!this.connection || !this.isConnected) return;
    const now = Date.now();
    if (now - this.lastTypingSentAt < 500) return;
    this.lastTypingSentAt = now;
    try {
      this.connection.send({ type: 'typing', timestamp: now });
    } catch (_) {}
  }

  handleChatReceive(data) {
    if (data.type === 'chat') {
      this.appendChatMessage({ text: data.message, own: false, timestamp: data.timestamp || Date.now() });
      const indicator = document.getElementById('typingIndicator');
      if (indicator) indicator.classList.add('hidden');
      if (this.typingTimeoutId) clearTimeout(this.typingTimeoutId);
      return;
    }
    if (data.type === 'typing') {
      const indicator = document.getElementById('typingIndicator');
      if (indicator) indicator.classList.remove('hidden');
      if (this.typingTimeoutId) clearTimeout(this.typingTimeoutId);
      this.typingTimeoutId = setTimeout(() => {
        const ind = document.getElementById('typingIndicator');
        if (ind) ind.classList.add('hidden');
      }, 1200);
      return;
    }
  }

  appendChatMessage({ text, own, timestamp }) {
    const list = document.getElementById('chatMessages');
    if (!list) return;
    const item = document.createElement('div');
    item.className = `message${own ? ' own' : ''}`;
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;
    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = new Date(timestamp).toLocaleTimeString();
    item.appendChild(bubble);
    item.appendChild(time);
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
  }

  async sendFile(file, fileIndex = 1, totalFiles = 1) {
    if (!this.connection || !this.isConnected) {
      alert('No active connection');
      return;
    }

    try {
      // Unique transfer id per file for sync
      const transferId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const displayName = file.relativePath || file.name;
      const statusPrefix = totalFiles > 1 ? `[${fileIndex}/${totalFiles}] ` : '';
      
      this.updateStatus(`${statusPrefix}Sending ${displayName}...`);

      // Send file metadata
      const metadata = {
        name: file.name,
        size: file.size,
        type: file.type,
        relativePath: file.relativePath || '',
        lastModified: file.lastModified
      };

      this.connection.send({
        type: 'file-metadata',
        metadata: metadata,
        transferId: transferId
      });

      // Wait for receiver to acknowledge metadata before sending data
      await this.waitForAck({ transferId, phase: 'metadata' });

      // CHUNKED SENDING FOR LARGE FILES
      const CHUNK_SIZE = 25 * 1024 * 1024; // 25MB chunks
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      if (file.size <= CHUNK_SIZE) {
        // Small file - send directly
        const arrayBuffer = await file.arrayBuffer();
        this.connection.send({
          type: 'file-data',
          data: arrayBuffer,
          isComplete: true,
          transferId: transferId
        });

        // Wait for completion ack
        await this.waitForAck({ transferId, phase: 'complete' });
      } else {
        // Large file - send in chunks
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
          const start = chunkIndex * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);
          const arrayBuffer = await chunk.arrayBuffer();

          this.connection.send({
            type: 'file-chunk',
            chunkIndex: chunkIndex,
            totalChunks: totalChunks,
            data: arrayBuffer,
            isLastChunk: chunkIndex === totalChunks - 1,
            transferId: transferId
          });

          // Wait for ack of this chunk to keep sender and receiver in sync
          await this.waitForAck({ transferId, phase: 'chunk', chunkIndex });

          // Update progress
          const progress = ((chunkIndex + 1) / totalChunks * 100).toFixed(1);
          this.updateStatus(`${statusPrefix}Sending ${displayName}: ${progress}%`);
          this.updateProgressUI(progress);

          // Small delay to prevent overwhelming
          if (chunkIndex % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
      }

      if (totalFiles === 1) {
        this.updateStatus(`✅ ${displayName} sent successfully!`);
        this.updateProgressUI(100);
      }

    } catch (error) {
      console.error('Error sending file:', error);
      this.updateStatus('❌ File send failed: ' + error.message);
    }
  }

  handleFileReceive(data) {
    try {
      if (data.type === 'batch-start') {
        this.updateStatus(`Receiving ${data.fileCount} files...`);
        this.currentBatch = { received: 0, total: data.fileCount };
        return;
      }

      if (data.type === 'batch-complete') {
        this.updateStatus(`✅ All ${this.currentBatch.total} files received!`);
        this.currentBatch = null;
        return;
      }

      if (data.type === 'file-metadata') {
        this.currentFileMetadata = data.metadata;
        this.fileChunks = [];
        this.updateStatus(`Receiving ${data.metadata.relativePath || data.metadata.name}...`);
        // Update transfer card filename/action
        const nameEl = document.getElementById('transferFileName');
        if (nameEl) nameEl.textContent = data.metadata.relativePath || data.metadata.name;
        const actionEl = document.getElementById('transferAction');
        if (actionEl) actionEl.textContent = 'Downloading';
        const transferCard = document.getElementById('transferProgress');
        if (transferCard) transferCard.classList.remove('hidden');
        // Remember current transfer id for this incoming file
        this.currentTransferId = data.transferId;
        // Ack metadata receipt so sender can begin data transfer
        if (this.connection) {
          this.connection.send({ type: 'ack', transferId: data.transferId, phase: 'metadata' });
        }
        return;
      }

      if (data.type === 'file-data') {
        // Complete file received
        this.downloadFile(new Blob([data.data], { 
          type: this.currentFileMetadata.type || 'application/octet-stream' 
        }), this.currentFileMetadata);
        // Ack completion for small files
        if (this.connection) {
          this.connection.send({ type: 'ack', transferId: data.transferId, phase: 'complete' });
        }
        this.finalizeBatch();
        return;
      }

      if (data.type === 'file-chunk') {
        // Store chunk
        this.fileChunks[data.chunkIndex] = new Uint8Array(data.data);
        
        const progress = ((data.chunkIndex + 1) / data.totalChunks * 100).toFixed(1);
        this.updateStatus(`Receiving ${this.currentFileMetadata.relativePath || this.currentFileMetadata.name}: ${progress}%`);
        this.updateProgressUI(progress);

        // Ack this chunk so sender can proceed with the next one
        if (this.connection) {
          this.connection.send({ type: 'ack', transferId: data.transferId, phase: 'chunk', chunkIndex: data.chunkIndex });
        }

        // If last chunk, assemble file
        if (data.isLastChunk) {
          const blob = new Blob(this.fileChunks, { 
            type: this.currentFileMetadata.type || 'application/octet-stream' 
          });
          this.downloadFile(blob, this.currentFileMetadata);
          this.finalizeBatch();
          // Show completed styling
          const fill = document.getElementById('progressFill');
          if (fill) fill.style.background = 'linear-gradient(90deg, #22c55e, #98fb98)';
          const actionEl = document.getElementById('transferAction');
          if (actionEl) actionEl.textContent = 'Downloaded';
        }
        return;
      }

    } catch (error) {
      console.error('Error handling received data:', error);
      this.updateStatus('❌ Error receiving file');
    }
  }

  // Ack handling and waiting utilities
  _ackKey({ transferId, phase, chunkIndex }) {
    return `${transferId}|${phase}|${chunkIndex ?? ''}`;
  }

  waitForAck(expectation, timeoutMs = 15000) {
    const key = this._ackKey(expectation);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        delete this.pendingAcks[key];
        reject(new Error('Ack timeout'));
      }, timeoutMs);
      this.pendingAcks[key] = {
        resolve: (data) => {
          clearTimeout(timeout);
          delete this.pendingAcks[key];
          resolve(data);
        }
      };
    });
  }

  handleAck(data) {
    const key = this._ackKey(data);
    const entry = this.pendingAcks[key];
    if (entry) {
      entry.resolve(data);
    }
  }

  finalizeBatch() {
    if (this.currentBatch) {
      this.currentBatch.received++;
      if (this.currentBatch.received < this.currentBatch.total) {
        this.updateStatus(`Received ${this.currentBatch.received}/${this.currentBatch.total} files...`);
      }
    } else {
      this.updateStatus(`✅ File received successfully!`);
    }
    
    this.addToDownloadHistory(this.currentFileMetadata);
    this.currentFileMetadata = null;
    this.fileChunks = [];
  }

  downloadFile(blob, metadata) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = metadata.relativePath || metadata.name;
    a.style.display = 'none';
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  addToDownloadHistory(metadata) {
    const historyDiv = document.getElementById('transferHistory') || document.getElementById('downloadHistory');
    const item = document.createElement('div');
    item.className = historyDiv?.id === 'transferHistory' ? 'file-item' : 'download-item';
    if (historyDiv?.id === 'transferHistory') {
      item.innerHTML = `
        <div class="file-icon">📥</div>
        <div class="file-info">
          <div class="file-name">${metadata.relativePath || metadata.name}</div>
          <div class="file-size">${this.formatFileSize(metadata.size)} • ${new Date().toLocaleTimeString()}</div>
        </div>
      `;
    } else {
      item.innerHTML = `
        <span>${metadata.relativePath || metadata.name}</span>
        <span class="file-size">${this.formatFileSize(metadata.size)}</span>
        <span class="timestamp">${new Date().toLocaleTimeString()}</span>
      `;
    }
    historyDiv.prepend(item);
    
    const emptyState = historyDiv.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  updateStatus(message) {
    console.log('Status:', message);
    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.textContent = message;
    // New UI status indicator
    const connStatus = document.getElementById('connectionStatus');
    const indicator = connStatus?.querySelector('.status-indicator');
    const label = connStatus?.querySelector('span');
    if (label) label.textContent = message;
    if (indicator) {
      indicator.classList.remove('waiting', 'connected', 'error');
      const lower = message.toLowerCase();
      if (lower.includes('error') || lower.includes('❌')) indicator.classList.add('error');
      else if (lower.includes('ready') || lower.includes('connected') || lower.includes('✅')) indicator.classList.add('connected');
      else indicator.classList.add('waiting');
    }
  }

  updateProgressUI(percentString) {
    const percent = Math.max(0, Math.min(100, parseFloat(percentString) || 0));
    const fill = document.getElementById('progressFill');
    const pct = document.getElementById('progressPercent');
    const container = document.getElementById('transferProgress');
    if (fill) fill.style.width = `${percent}%`;
    if (pct) pct.textContent = `${percent.toFixed(0)}%`;
    if (container) container.classList.remove('hidden');
  }

  notify(text) {
    const area = document.getElementById('notifications');
    if (!area) return;
    const n = document.createElement('div');
    n.className = 'notification info';
    n.textContent = text;
    area.appendChild(n);
    setTimeout(() => n.remove(), 2500);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new P2PFileShare();
});
