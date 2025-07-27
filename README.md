# P2P File Share

A peer-to-peer file sharing application built with WebRTC that allows direct file transfers between browsers without any server-side relay for the actual file data.

## Features

- 🔗 **Direct P2P Connection**: Files are transferred directly between browsers using WebRTC
- 🔒 **Secure**: All data is encrypted end-to-end by WebRTC's built-in security
- 📱 **No Installation Required**: Works in any modern web browser
- 🌐 **Cross-Platform**: Works on desktop and mobile devices
- 🚀 **Fast Transfers**: Direct connection means maximum speed (limited only by your internet)
- 📋 **Simple Code System**: 12-character codes make sharing easy
- 📁 **Multiple Files**: Support for multiple file transfers
- 📊 **Progress Tracking**: Real-time transfer progress indicators
- 🎯 **Drag & Drop**: Intuitive file selection with drag and drop support

## How It Works

1. **Visit the website** - You automatically get a unique 12-character code
2. **Share your code** - Give your code to someone who wants to send you files
3. **Connect** - They enter your code and request a connection
4. **Accept** - You get a prompt to accept or reject the connection
5. **Transfer** - Once connected, files transfer directly between your browsers!

## Quick Start

### Prerequisites

- Node.js 16+ installed on your system
- A modern web browser (Chrome, Firefox, Safari, Edge)

### Installation & Running

1. **Clone or download this project**
   ```bash
   # If using git
   git clone <repository-url>
   cd p2p-file-share

   # Or download and extract the ZIP file
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Open your browser**
   Navigate to: `http://localhost:3000`

5. **Share with others**
   - Others can access the same URL to connect with you
   - For internet access, you'll need to expose port 3000 or deploy to a server

## Usage Guide

### Getting Your Code
- Your unique code appears automatically when you visit the site
- Click the 📋 button to copy it to clipboard
- Share this code with people you want to receive files from

### Connecting to Someone
1. Get their 12-character code
2. Enter it in the "Connect to Someone" field
3. Click "Connect"
4. Wait for them to accept your connection request

### Accepting Connections
- When someone tries to connect to you, you'll see a popup
- Click "Accept" to establish the connection
- Click "Reject" to deny the connection

### Sending Files
- Once connected, the file transfer section appears
- Click "Select files" or drag and drop files onto the designated area
- Multiple files can be selected at once
- Progress will be shown during transfer

### Receiving Files
- Received files appear in the "Received Files" section
- Click "Download" next to any file to save it to your device
- Files are temporarily stored in your browser until downloaded

## Technical Details

### Architecture
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js with Express and WebSocket (ws library)
- **P2P Technology**: WebRTC with STUN servers for NAT traversal
- **File Transfer**: RTCDataChannel with chunked transfer (16KB chunks)

### Browser Compatibility
- ✅ Chrome 60+
- ✅ Firefox 55+
- ✅ Safari 14+
- ✅ Edge 79+
- ❌ Internet Explorer (not supported)

### Network Requirements
- Works on most home and office networks
- STUN servers help with NAT traversal
- Some corporate firewalls may block P2P connections
- Both users must be online simultaneously

### File Size Limits
- No artificial file size limits imposed by the application
- Limited only by:
  - Available RAM (files are chunked to minimize memory usage)
  - Browser stability (very large files may cause issues)
  - Network stability (connection must remain active during transfer)
- Recommended maximum: 1GB per file for best experience

### Security
- All connections are encrypted by WebRTC (DTLS/SRTP)
- No files are stored on the server
- Codes are temporary and deleted when users disconnect
- No personal information is collected or stored

## Deployment

### Local Network
The application works out of the box on a local network. All devices on the same network can access it via your local IP.

### Internet Deployment
For internet access, you can deploy to:

#### Option 1: Cloud Platforms
- **Heroku**: Add a `Procfile` with `web: node server.js`
- **Railway**: Direct deployment from GitHub
- **Render**: Simple Node.js deployment
- **DigitalOcean**: VPS with Node.js setup

#### Option 2: Self-Hosted
- Forward port 3000 on your router
- Use a domain name or dynamic DNS
- Consider using a reverse proxy (nginx) for HTTPS

### Environment Variables
- `PORT`: Server port (default: 3000)

## Troubleshooting

### Connection Issues
- **"Code not found"**: Make sure the other person is online and their browser is open to the site
- **Connection fails**: Check if you're both behind strict firewalls; try from different networks
- **Can't connect**: Ensure both browsers support WebRTC (all modern browsers do)

### File Transfer Issues
- **Transfer stops**: Connection was lost; both users need to stay online during transfer
- **Large files fail**: Try smaller files first; some browsers have memory limitations
- **Slow transfer**: Speed depends on the slower upload/download speed of both users

### Performance Tips
- Close unnecessary browser tabs to free up memory
- Use wired internet connection for best speed
- Ensure stable internet connection during transfers
- For very large files, consider splitting them into smaller chunks

## Development

### Project Structure
```
p2p-file-share/
├── server.js          # WebSocket signaling server
├── package.json       # Node.js dependencies
├── public/            # Frontend files
│   ├── index.html     # Main HTML page
│   ├── style.css      # Styling
│   └── app.js         # Frontend JavaScript
└── README.md          # This file
```

### Adding Features
The codebase is structured to easily add new features:
- **Video calling**: Extend WebRTC to include media streams
- **Text messaging**: Use the existing data channel for messages
- **File sharing rooms**: Modify the code system to support groups
- **Persistent connections**: Add user accounts and offline messaging

### API Reference
The WebSocket signaling protocol uses these message types:
- `your-code`: Server assigns code to client
- `connect-request`: Request connection to a code
- `incoming-connection`: Notify user of incoming request
- `accept-connection`/`reject-connection`: Response to connection request
- `offer`/`answer`/`ice-candidate`: WebRTC signaling messages

## Contributing

Feel free to contribute improvements:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use this code for personal or commercial projects.

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Ensure you're using a supported browser
3. Try on a different network
4. Check browser console for error messages

---

**Enjoy secure, fast, peer-to-peer file sharing! 🚀**