# 3D Video Mapping System

A real-time 3D graphics engine with WebSocket streaming for video processing workflows. Perfect for VJing, live visuals, and interactive installations.

## 🎯 What This Does

- **3D Engine**: Interactive 3D model viewer with perspective projection
- **WebSocket Server**: Streams rendered frames to video processing software
- **Multiple Outputs**: PNG, WebP, JPEG formats with adjustable quality
- **Real-time Dashboard**: Monitor and control streaming parameters

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
node websocket-frame-server.js
```

### 3. Open the 3D Engine
Open `3D Projection Engine.html` in your browser.

### 4. Connect & Stream
1. In the 3D Engine, go to "WebSocket Streaming" section
2. Click "Connect" (uses `ws://localhost:8080` by default)
3. Enable streaming with the checkbox
4. Frames will stream at ~30fps

### 5. Use in Video Software
- **HTTP Endpoint**: `http://localhost:8080/frame.png` (or `.webp`, `.jpeg`)
- **Dashboard**: `http://localhost:8080` - monitor stats and adjust settings

## 📁 Project Structure

```
├── 3D Projection Engine.html     # Main 3D graphics interface
├── websocket-frame-server.js     # WebSocket server with dashboard
├── package.json                  # Node.js dependencies
└── README.md                     # This file
```

## 🎨 Features

### 3D Engine
- **Models**: Cube, Pyramid, Octahedron, Icosahedron
- **OBJ Import**: Load custom 3D models
- **Custom Data**: Input vertices/edges manually
- **Controls**: Rotation, camera distance, scale
- **Rendering**: Wireframe, vertices, depth sorting

### Server Features
- **Multiple Formats**: PNG, WebP, JPEG output
- **Quality Control**: Adjustable compression (10-100%)
- **Real-time Dashboard**: Monitor connections, frame rate, data usage
- **API Endpoints**: REST API for configuration and stats
- **Error Handling**: Robust connection management

### Streaming
- **WebSocket Protocol**: Low-latency frame transmission
- **30 FPS**: Optimized for real-time performance
- **Format Switching**: Change output format on-the-fly
- **Statistics**: Bitrate, latency, frame counts

## 🔧 API Endpoints

### WebSocket
- `ws://localhost:8080` - Frame input from 3D engine

### HTTP Endpoints
- `GET /` - Dashboard interface
- `GET /frame.png` - Current frame (also `.webp`, `.jpeg`)
- `GET /stats` - JSON statistics
- `GET /health` - Server health check
- `POST /config` - Update server settings
- `POST /clear` - Clear frame buffer

## 🖥️ Video Software Integration

### OBS Studio
1. Add "Browser Source"
2. Set URL to `http://localhost:8080/frame.webp`
3. Adjust quality settings via dashboard

### Custom Applications
```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:8080');

// Handle incoming frames
ws.onmessage = (event) => {
  const imageData = event.data; // data:image/webp;base64,...
  // Process frame...
};

// Or fetch via HTTP
fetch('http://localhost:8080/frame.webp')
  .then(r => r.blob())
  .then(blob => {
    // Use frame...
  });
```

## ⚙️ Configuration

### Server Settings
Edit `websocket-frame-server.js` constants:
```javascript
const CONFIG = {
  outputFormat: 'png',    // 'png', 'webp', 'jpeg'
  quality: 90,           // 10-100 for WebP/JPEG
  maxFrameSize: 50MB,    // Maximum frame size
  cleanupInterval: 30s,  // Memory cleanup
  statsInterval: 5s      // Stats logging
};
```

### Environment Variables
```bash
PORT=8080 node websocket-frame-server.js
```

## 🔍 Troubleshooting

### Server Won't Start
- Check if port 8080 is available: `lsof -i :8080`
- Install dependencies: `npm install`

### No Frames in Video Software
- Check server dashboard for connection status
- Verify WebSocket URL in 3D engine
- Enable streaming checkbox in 3D engine

### Poor Performance
- Reduce frame quality in server dashboard
- Switch to WebP format for better compression
- Close other applications using CPU/GPU

## 🛠️ Development

### Adding New Models
```javascript
// In 3D Projection Engine.html
createCustomModel() {
  this.vertices = [
    new Vector3(x1, y1, z1),
    new Vector3(x2, y2, z2),
    // ...
  ];
  this.edges = [
    [0, 1], [1, 2], // ...
  ];
}
```

### Server Extensions
```javascript
// Add custom endpoint
app.get('/custom', (req, res) => {
  // Custom logic...
});
```

## 📋 Requirements

- **Node.js** 14+
- **Modern Browser** (Chrome, Firefox, Safari)

## 📄 License

ISC License - feel free to use in your projects!

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 🙏 Acknowledgments

- **Original Inspiration**: [Tsoding's 3D Graphics Tutorial](https://www.youtube.com/watch?v=qjWkNZ0SXfo) - Source Code: [tsoding/formula](https://github.com/tsoding/formula)
- Built with HTML5 Canvas, WebSockets, and Sharp
- Inspired by classic 3D graphics and VJ tools
