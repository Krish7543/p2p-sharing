// P2P File Share Application
class P2PFileShare {
    constructor() {
        this.ws = null;
        this.pc = null;
        this.dataChannel = null;
        this.yourCode = null;
        this.connectedPeerCode = null;
        this.isConnected = false;

        // File transfer state
        this.sendingFiles = [];
        this.receivingFiles = new Map();
        this.chunkSize = 16384; // 16KB chunks

        this.initializeElements();
        this.connectWebSocket();
        this.setupEventListeners();
    }

    initializeElements() {
        // DOM elements
        this.elements = {
            yourCode: document.getElementById('yourCode'),
            copyCodeBtn: document.getElementById('copyCodeBtn'),
            peerCodeInput: document.getElementById('peerCodeInput'),
            connectBtn: document.getElementById('connectBtn'),
            statusDisplay: document.getElementById('statusDisplay'),
            fileSection: document.getElementById('fileSection'),
            fileInput: document.getElementById('fileInput'),
            fileDropZone: document.getElementById('fileDropZone'),
            sendProgress: document.getElementById('sendProgress'),
            sendProgressFill: document.getElementById('sendProgressFill'),
            sendProgressText: document.getElementById('sendProgressText'),
            receivedFiles: document.getElementById('receivedFiles'),
            receiveProgress: document.getElementById('receiveProgress'),
            receiveProgressFill: document.getElementById('receiveProgressFill'),
            receiveProgressText: document.getElementById('receiveProgressText'),
            connectionModal: document.getElementById('connectionModal'),
            incomingCode: document.getElementById('incomingCode'),
            acceptBtn: document.getElementById('acceptBtn'),
            rejectBtn: document.getElementById('rejectBtn'),
            notifications: document.getElementById('notifications')
        };
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.showNotification('Connected to server', 'success');
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleSignalingMessage(message);
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.showNotification('Disconnected from server', 'error');
            this.updateStatus('disconnected', 'Connection lost');
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.showNotification('Connection error', 'error');
        };
    }

    setupEventListeners() {
        // Copy code button
        this.elements.copyCodeBtn.onclick = () => this.copyCodeToClipboard();

        // Connect button
        this.elements.connectBtn.onclick = () => this.initiateConnection();

        // Enter key in peer code input
        this.elements.peerCodeInput.onkeypress = (e) => {
            if (e.key === 'Enter') this.initiateConnection();
        };

        // File input
        this.elements.fileInput.onchange = (e) => this.handleFileSelection(e.target.files);

        // Drag and drop
        this.setupDragAndDrop();

        // Modal buttons
        this.elements.acceptBtn.onclick = () => this.acceptConnection();
        this.elements.rejectBtn.onclick = () => this.rejectConnection();

        // Auto-format peer code input
        this.elements.peerCodeInput.oninput = (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-F0-9]/g, '');
        };
    }

    setupDragAndDrop() {
        const dropZone = this.elements.fileDropZone;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, this.preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false);
        });

        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            this.handleFileSelection(files);
        }, false);
    }

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    handleSignalingMessage(message) {
        console.log('Received signaling message:', message);

        switch (message.type) {
            case 'your-code':
                this.yourCode = message.code;
                this.elements.yourCode.textContent = message.code;
                this.updateStatus('disconnected', 'Ready to connect');
                break;

            case 'incoming-connection':
                this.showConnectionModal(message.fromCode);
                break;

            case 'connection-accepted':
                this.connectedPeerCode = message.fromCode;
                this.createPeerConnection(true); // As caller
                break;

            case 'connection-rejected':
                this.showNotification('Connection rejected', 'warning');
                this.resetConnection();
                break;

            case 'connection-error':
                this.showNotification(message.message, 'error');
                this.resetConnection();
                break;

            case 'offer':
                this.handleOffer(message);
                break;

            case 'answer':
                this.handleAnswer(message);
                break;

            case 'ice-candidate':
                this.handleIceCandidate(message);
                break;

            case 'peer-disconnected':
                this.showNotification('Peer disconnected', 'warning');
                this.resetConnection();
                break;
        }
    }

    copyCodeToClipboard() {
        if (this.yourCode) {
            navigator.clipboard.writeText(this.yourCode).then(() => {
                this.showNotification('Code copied to clipboard!', 'success');
            }).catch(() => {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = this.yourCode;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                this.showNotification('Code copied to clipboard!', 'success');
            });
        }
    }

    initiateConnection() {
        const peerCode = this.elements.peerCodeInput.value.trim().toUpperCase();

        if (!peerCode) {
            this.showNotification('Please enter a peer code', 'warning');
            return;
        }

        if (peerCode === this.yourCode) {
            this.showNotification('Cannot connect to yourself', 'warning');
            return;
        }

        if (peerCode.length !== 12) {
            this.showNotification('Code must be 12 characters', 'warning');
            return;
        }

        this.connectedPeerCode = peerCode;
        this.updateStatus('connecting', 'Requesting connection...');

        this.sendSignalingMessage({
            type: 'connect-request',
            targetCode: peerCode
        });
    }

    showConnectionModal(fromCode) {
        this.elements.incomingCode.textContent = fromCode;
        this.elements.connectionModal.style.display = 'flex';
    }

    acceptConnection() {
        this.elements.connectionModal.style.display = 'none';
        const fromCode = this.elements.incomingCode.textContent;
        this.connectedPeerCode = fromCode;

        this.sendSignalingMessage({
            type: 'accept-connection',
            targetCode: fromCode
        });

        this.createPeerConnection(false); // As answerer
    }

    rejectConnection() {
        this.elements.connectionModal.style.display = 'none';
        const fromCode = this.elements.incomingCode.textContent;

        this.sendSignalingMessage({
            type: 'reject-connection',
            targetCode: fromCode
        });
    }

    createPeerConnection(isInitiator) {
        this.pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });

        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignalingMessage({
                    type: 'ice-candidate',
                    targetCode: this.connectedPeerCode,
                    candidate: event.candidate
                });
            }
        };

        this.pc.ondatachannel = (event) => {
            const channel = event.channel;
            this.setupDataChannel(channel);
        };

        if (isInitiator) {
            this.dataChannel = this.pc.createDataChannel('fileShare', {
                ordered: true
            });
            this.setupDataChannel(this.dataChannel);

            this.pc.createOffer().then(offer => {
                return this.pc.setLocalDescription(offer);
            }).then(() => {
                this.sendSignalingMessage({
                    type: 'offer',
                    targetCode: this.connectedPeerCode,
                    sdp: this.pc.localDescription
                });
            });
        }

        this.updateStatus('connecting', 'Establishing connection...');
    }

    setupDataChannel(channel) {
        this.dataChannel = channel;

        channel.onopen = () => {
            console.log('Data channel opened');
            this.isConnected = true;
            this.updateStatus('connected', `Connected to ${this.connectedPeerCode}`);
            this.elements.fileSection.style.display = 'block';
            this.showNotification('P2P connection established!', 'success');
        };

        channel.onclose = () => {
            console.log('Data channel closed');
            this.resetConnection();
        };

        channel.onmessage = (event) => {
            this.handleDataChannelMessage(event.data);
        };

        channel.onerror = (error) => {
            console.error('Data channel error:', error);
            this.showNotification('Connection error', 'error');
        };
    }

    handleOffer(message) {
        this.pc.setRemoteDescription(new RTCSessionDescription(message.sdp)).then(() => {
            return this.pc.createAnswer();
        }).then(answer => {
            return this.pc.setLocalDescription(answer);
        }).then(() => {
            this.sendSignalingMessage({
                type: 'answer',
                targetCode: message.fromCode,
                sdp: this.pc.localDescription
            });
        });
    }

    handleAnswer(message) {
        this.pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
    }

    handleIceCandidate(message) {
        this.pc.addIceCandidate(new RTCIceCandidate(message.candidate));
    }

    sendSignalingMessage(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    handleFileSelection(files) {
        if (!this.isConnected) {
            this.showNotification('Please connect to a peer first', 'warning');
            return;
        }

        Array.from(files).forEach(file => this.sendFile(file));
    }

    sendFile(file) {
        const fileId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const fileInfo = {
            id: fileId,
            name: file.name,
            size: file.size,
            type: file.type
        };

        // Send file metadata first
        this.dataChannel.send(JSON.stringify({
            type: 'file-start',
            fileInfo: fileInfo
        }));

        this.sendingFiles.push({
            file: file,
            fileId: fileId,
            sent: 0
        });

        this.sendFileChunks(file, fileId);
    }

    sendFileChunks(file, fileId) {
        const reader = new FileReader();
        let offset = 0;

        const sendingFile = this.sendingFiles.find(f => f.fileId === fileId);

        const readSlice = () => {
            const slice = file.slice(offset, offset + this.chunkSize);
            reader.readAsArrayBuffer(slice);
        };

        reader.onload = (event) => {
            if (this.dataChannel && this.dataChannel.readyState === 'open') {
                // Send chunk header
                this.dataChannel.send(JSON.stringify({
                    type: 'file-chunk',
                    fileId: fileId,
                    offset: offset,
                    size: event.target.result.byteLength
                }));

                // Send chunk data
                this.dataChannel.send(event.target.result);

                offset += event.target.result.byteLength;

                if (sendingFile) {
                    sendingFile.sent = offset;
                    this.updateSendProgress(offset, file.size);
                }

                if (offset < file.size) {
                    readSlice();
                } else {
                    // File transfer complete
                    this.dataChannel.send(JSON.stringify({
                        type: 'file-end',
                        fileId: fileId
                    }));

                    this.showNotification(`File "${file.name}" sent successfully!`, 'success');
                    this.elements.sendProgress.style.display = 'none';

                    // Remove from sending files
                    const index = this.sendingFiles.findIndex(f => f.fileId === fileId);
                    if (index > -1) {
                        this.sendingFiles.splice(index, 1);
                    }
                }
            }
        };

        this.elements.sendProgress.style.display = 'block';
        readSlice();
    }

    handleDataChannelMessage(data) {
        if (typeof data === 'string') {
            // Control message
            const message = JSON.parse(data);

            switch (message.type) {
                case 'file-start':
                    this.startReceivingFile(message.fileInfo);
                    break;

                case 'file-chunk':
                    // Next message will be the chunk data
                    this.expectingChunk = message;
                    break;

                case 'file-end':
                    this.finishReceivingFile(message.fileId);
                    break;
            }
        } else {
            // Binary data (file chunk)
            if (this.expectingChunk) {
                this.receiveFileChunk(this.expectingChunk, data);
                this.expectingChunk = null;
            }
        }
    }

    startReceivingFile(fileInfo) {
        this.receivingFiles.set(fileInfo.id, {
            info: fileInfo,
            chunks: [],
            receivedSize: 0
        });

        this.showNotification(`Receiving "${fileInfo.name}"...`, 'success');
        this.elements.receiveProgress.style.display = 'block';
    }

    receiveFileChunk(chunkInfo, data) {
        const receivingFile = this.receivingFiles.get(chunkInfo.fileId);
        if (!receivingFile) return;

        receivingFile.chunks.push({
            offset: chunkInfo.offset,
            data: data
        });

        receivingFile.receivedSize += data.byteLength;
        this.updateReceiveProgress(receivingFile.receivedSize, receivingFile.info.size);
    }

    finishReceivingFile(fileId) {
        const receivingFile = this.receivingFiles.get(fileId);
        if (!receivingFile) return;

        // Sort chunks by offset
        receivingFile.chunks.sort((a, b) => a.offset - b.offset);

        // Combine chunks
        const blob = new Blob(receivingFile.chunks.map(chunk => chunk.data), {
            type: receivingFile.info.type
        });

        this.addReceivedFile(receivingFile.info, blob);

        this.receivingFiles.delete(fileId);
        this.elements.receiveProgress.style.display = 'none';

        this.showNotification(`File "${receivingFile.info.name}" received!`, 'success');
    }

    addReceivedFile(fileInfo, blob) {
        // Remove "no files" message
        const noFilesMsg = this.elements.receivedFiles.querySelector('.no-files');
        if (noFilesMsg) {
            noFilesMsg.remove();
        }

        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';

        fileItem.innerHTML = `
            <div class="file-info">
                <div class="file-name">${fileInfo.name}</div>
                <div class="file-size">${this.formatFileSize(fileInfo.size)}</div>
            </div>
            <button class="download-btn" onclick="app.downloadFile('${fileInfo.id}')">Download</button>
        `;

        this.elements.receivedFiles.appendChild(fileItem);

        // Store blob for download
        fileItem.dataset.blob = URL.createObjectURL(blob);
        fileItem.dataset.filename = fileInfo.name;
    }

    downloadFile(elementId) {
        // Find the file item by looking for the download button
        const fileItems = this.elements.receivedFiles.querySelectorAll('.file-item');
        for (let item of fileItems) {
            const btn = item.querySelector('.download-btn');
            if (btn && btn.onclick.toString().includes(elementId)) {
                const a = document.createElement('a');
                a.href = item.dataset.blob;
                a.download = item.dataset.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                break;
            }
        }
    }

    updateSendProgress(sent, total) {
        const percentage = Math.round((sent / total) * 100);
        this.elements.sendProgressFill.style.width = percentage + '%';
        this.elements.sendProgressText.textContent = `${percentage}% (${this.formatFileSize(sent)} / ${this.formatFileSize(total)})`;
    }

    updateReceiveProgress(received, total) {
        const percentage = Math.round((received / total) * 100);
        this.elements.receiveProgressFill.style.width = percentage + '%';
        this.elements.receiveProgressText.textContent = `${percentage}% (${this.formatFileSize(received)} / ${this.formatFileSize(total)})`;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    updateStatus(status, message) {
        this.elements.statusDisplay.className = `status-display ${status}`;
        this.elements.statusDisplay.querySelector('.status-text').textContent = message;
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        this.elements.notifications.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    resetConnection() {
        this.isConnected = false;
        this.connectedPeerCode = null;

        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }

        this.dataChannel = null;
        this.sendingFiles = [];
        this.receivingFiles.clear();

        this.elements.fileSection.style.display = 'none';
        this.elements.sendProgress.style.display = 'none';
        this.elements.receiveProgress.style.display = 'none';
        this.elements.peerCodeInput.value = '';

        this.updateStatus('disconnected', 'Not connected');
    }
}

// Initialize the application
const app = new P2PFileShare();

// Make it available globally for download function
window.app = app;