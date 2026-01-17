/**
 * WebSocket Frame Server
 *
 * Receives image frames from 3D Engine via WebSocket and serves them as PNG/WebP
 * Optimized for real-time video processing workflows
 *
 * Features:
 * - WebSocket frame reception with automatic format detection
 * - Multiple output formats (PNG, WebP, JPEG)
 * - Real-time preview dashboard
 * - Connection statistics and monitoring
 * - Automatic cleanup and error recovery
 *
 * Usage:
 * npm install ws express sharp canvas
 * node websocket-frame-server.js
 */

const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const sharp = require('sharp');
const path = require('path');

const PORT = process.env.PORT || 8080;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Server state
let latestFrameBuffer = null;
let frameCount = 0;
let clientCount = 0;
let bytesReceived = 0;
let lastFrameType = 'waiting...';
let serverStartTime = Date.now();
let connectionErrors = 0;

// Configuration
const CONFIG = {
  outputFormat: 'png', // 'png', 'webp', 'jpeg'
  quality: 90, // for WebP/JPEG
  maxFrameSize: 50 * 1024 * 1024, // 50MB limit
  cleanupInterval: 30000, // 30 seconds
  statsInterval: 5000, // 5 seconds
};

// Dashboard with enhanced features
app.get('/', (req, res) => {
  const uptime = Math.floor((Date.now() - serverStartTime) / 1000);
  const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`;

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>WebSocket Frame Server</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          padding: 20px;
          background: linear-gradient(135deg, #0f172a 0%, #1a1f35 100%);
          color: #f1f5f9;
          line-height: 1.6;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { margin-bottom: 30px; font-size: 32px; text-align: center; }
        .status { padding: 20px; background: rgba(16, 185, 129, 0.1); border: 2px solid #10b981; border-radius: 8px; margin-bottom: 30px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .card { padding: 20px; background: rgba(6, 182, 212, 0.1); border: 1px solid #06b6d4; border-radius: 8px; }
        .card-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px; }
        .card-value { font-size: 28px; color: #06b6d4; font-weight: bold; }
        .preview-section { margin-bottom: 30px; }
        .preview-title { font-size: 16px; color: #94a3b8; text-transform: uppercase; margin-bottom: 12px; }
        .preview-container { background: #000; border: 2px solid #334155; border-radius: 8px; padding: 10px; aspect-ratio: 16 / 9; display: flex; align-items: center; justify-content: center; position: relative; }
        .preview-container img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px; }
        .controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; }
        .control-group { padding: 15px; background: rgba(59, 130, 246, 0.1); border: 1px solid #3b82f6; border-radius: 8px; }
        .control-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px; }
        select, button { width: 100%; padding: 8px 12px; background: var(--bg); border: 1px solid #334155; border-radius: 6px; color: #f1f5f9; font-size: 14px; }
        button { background: #06b6d4; border: none; cursor: pointer; transition: background 0.2s; }
        button:hover { background: #0891b2; }
        .info { padding: 20px; background: rgba(139, 92, 246, 0.1); border: 1px solid #8b5cf6; border-radius: 8px; font-size: 14px; }
        .error { color: #ef4444; }
        .success { color: #10b981; }
        .warning { color: #f59e0b; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎬 WebSocket Frame Server</h1>

        <div class="status">
          <strong class="success">✓ Server Running</strong> on ws://localhost:${PORT}<br>
          <small>Uptime: ${uptimeStr} | Format: ${CONFIG.outputFormat.toUpperCase()}</small>
        </div>

        <div class="grid">
          <div class="card">
            <div class="card-label">Connected Clients</div>
            <div class="card-value" id="clients">0</div>
          </div>
          <div class="card">
            <div class="card-label">Frames Received</div>
            <div class="card-value" id="frames">0</div>
          </div>
          <div class="card">
            <div class="card-label">Data Processed</div>
            <div class="card-value" id="data">0 MB</div>
          </div>
          <div class="card">
            <div class="card-label">Frame Type</div>
            <div class="card-value" id="type" style="font-size: 16px;">waiting...</div>
          </div>
        </div>

        <div class="controls">
          <div class="control-group">
            <div class="control-label">Output Format</div>
            <select id="format" onchange="changeFormat(this.value)">
              <option value="png" ${CONFIG.outputFormat === 'png' ? 'selected' : ''}>PNG</option>
              <option value="webp" ${CONFIG.outputFormat === 'webp' ? 'selected' : ''}>WebP</option>
              <option value="jpeg" ${CONFIG.outputFormat === 'jpeg' ? 'selected' : ''}>JPEG</option>
            </select>
          </div>
          <div class="control-group">
            <div class="control-label">Quality (${CONFIG.quality}%)</div>
            <input type="range" id="quality" min="10" max="100" value="${CONFIG.quality}" oninput="updateQuality(this.value)">
          </div>
          <div class="control-group">
            <div class="control-label">Actions</div>
            <button onclick="clearFrames()">Clear Buffer</button>
          </div>
        </div>

        <div class="preview-section">
          <div class="preview-title">Live Preview</div>
          <div class="preview-container">
            <img id="preview" src="/frame.${CONFIG.outputFormat}?t=0" alt="Waiting for frames...">
          </div>
        </div>

        <div class="info">
          <strong>📋 How it works:</strong><br>
          1. 3D Engine sends data:image/... via WebSocket<br>
          2. Server decodes base64 and converts to ${CONFIG.outputFormat.toUpperCase()}<br>
          3. Available at <code>/frame.${CONFIG.outputFormat}</code> for video software<br>
          4. Use in OBS, VDMX, Resolume, or custom applications<br><br>
          <strong>🔗 Endpoints:</strong><br>
          • <code>ws://localhost:${PORT}</code> - WebSocket input<br>
          • <code>http://localhost:${PORT}/frame.${CONFIG.outputFormat}</code> - Frame output<br>
          • <code>http://localhost:${PORT}/stats</code> - JSON statistics<br>
          • <code>http://localhost:${PORT}/health</code> - Server health check
        </div>
      </div>

      <script>
        let updateInterval;
        let t = 0;

        function startUpdates() {
          updateInterval = setInterval(() => {
            t++;
            fetch('/stats')
              .then(r => r.json())
              .then(d => {
                document.getElementById('clients').textContent = d.clients;
                document.getElementById('frames').textContent = d.frames;
                document.getElementById('data').textContent = d.dataMB + ' MB';
                document.getElementById('type').textContent = d.type;
              })
              .catch(() => {
                document.getElementById('type').textContent = 'server offline';
                document.getElementById('type').style.color = '#ef4444';
              });

            const format = document.getElementById('format').value;
            document.getElementById('preview').src = '/frame.' + format + '?t=' + t;
          }, 500);
        }

        function changeFormat(format) {
          fetch('/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ outputFormat: format })
          }).then(() => {
            location.reload();
          });
        }

        function updateQuality(quality) {
          document.querySelector('.control-label').textContent = 'Quality (' + quality + '%)';
          fetch('/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quality: parseInt(quality) })
          });
        }

        function clearFrames() {
          fetch('/clear', { method: 'POST' })
            .then(() => {
              document.getElementById('preview').src = '/frame.${CONFIG.outputFormat}?t=' + Date.now();
            });
        }

        startUpdates();

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
          if (updateInterval) clearInterval(updateInterval);
        });
      </script>
    </body>
    </html>
  `);
});

// API endpoints
app.get('/stats', (req, res) => {
  res.json({
    clients: clientCount,
    frames: frameCount,
    dataMB: (bytesReceived / 1024 / 1024).toFixed(2),
    type: lastFrameType,
    uptime: Math.floor((Date.now() - serverStartTime) / 1000),
    errors: connectionErrors
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: Math.floor((Date.now() - serverStartTime) / 1000),
    clients: clientCount,
    frames: frameCount
  });
});

app.post('/config', express.json(), (req, res) => {
  if (req.body.outputFormat && ['png', 'webp', 'jpeg'].includes(req.body.outputFormat)) {
    CONFIG.outputFormat = req.body.outputFormat;
  }
  if (req.body.quality && req.body.quality >= 10 && req.body.quality <= 100) {
    CONFIG.quality = req.body.quality;
  }
  res.json({ success: true, config: CONFIG });
});

app.post('/clear', (req, res) => {
  latestFrameBuffer = null;
  frameCount = 0;
  bytesReceived = 0;
  lastFrameType = 'buffer cleared';
  res.json({ success: true });
});

// Frame serving endpoint
app.get('/frame.:format', (req, res) => {
  const format = req.params.format;

  if (!['png', 'webp', 'jpeg'].includes(format)) {
    return res.status(400).send('Invalid format. Use png, webp, or jpeg');
  }

  res.set('Content-Type', `image/${format}`);
  res.set('Cache-Control', 'no-cache');
  res.set('Access-Control-Allow-Origin', '*');

  if (latestFrameBuffer && latestFrameBuffer.length > 100) {
    // Convert to requested format if needed
    if (format !== CONFIG.outputFormat) {
      sharp(latestFrameBuffer)
        .toFormat(format, { quality: CONFIG.quality })
        .toBuffer()
        .then(buffer => res.send(buffer))
        .catch(() => res.send(latestFrameBuffer)); // fallback to original
    } else {
      res.send(latestFrameBuffer);
    }
  } else {
    // Return empty frame
    const emptyFrame = Buffer.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
      0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222
    ]);
    res.send(emptyFrame);
  }
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  clientCount++;
  const clientIP = req.socket.remoteAddress;
  console.log(`[✓] Client connected from ${clientIP}. Total: ${clientCount}`);

  ws.on('message', async (data) => {
    try {
      frameCount++;
      let buffer = null;
      let dataString = null;

      // Handle different data types
      if (Buffer.isBuffer(data)) {
        // Check for data URL signature
        if (data.length > 10 && data[0] === 0x64 && data[1] === 0x61 && data[2] === 0x74 && data[3] === 0x61) {
          dataString = data.toString('utf8');
        } else {
          // Handle raw image buffer
          buffer = data;
          lastFrameType = 'raw buffer';
        }
      } else if (typeof data === 'string') {
        dataString = data;
      }

      // Process data URL
      if (dataString && dataString.startsWith('data:image')) {
        // Validate size
        if (dataString.length > CONFIG.maxFrameSize) {
          console.warn(`[⚠] Frame too large: ${(dataString.length / 1024 / 1024).toFixed(2)} MB`);
          lastFrameType = 'frame too large';
          return;
        }

        bytesReceived += dataString.length;

        // Extract base64 part
        const base64Start = dataString.indexOf(',') + 1;
        const base64Data = dataString.substring(base64Start);

        try {
          buffer = Buffer.from(base64Data, 'base64');

          // Convert and optimize
          const sharpInstance = sharp(buffer);

          if (CONFIG.outputFormat === 'webp') {
            latestFrameBuffer = await sharpInstance.webp({ quality: CONFIG.quality }).toBuffer();
          } else if (CONFIG.outputFormat === 'jpeg') {
            latestFrameBuffer = await sharpInstance.jpeg({ quality: CONFIG.quality }).toBuffer();
          } else {
            latestFrameBuffer = await sharpInstance.png({ compressionLevel: 6 }).toBuffer();
          }

          lastFrameType = `data:image/* → ${CONFIG.outputFormat.toUpperCase()} ✓`;
          console.log(`[✓] Frame ${frameCount}: ${(dataString.length / 1024).toFixed(1)} KB → ${CONFIG.outputFormat.toUpperCase()} ${(latestFrameBuffer.length / 1024).toFixed(1)} KB`);

        } catch (conversionError) {
          lastFrameType = `conversion error: ${conversionError.message}`;
          console.error(`[!] Frame ${frameCount} conversion error:`, conversionError.message);
        }

      } else if (buffer) {
        // Handle raw buffer
        bytesReceived += buffer.length;

        try {
          const sharpInstance = sharp(buffer);

          if (CONFIG.outputFormat === 'webp') {
            latestFrameBuffer = await sharpInstance.webp({ quality: CONFIG.quality }).toBuffer();
          } else if (CONFIG.outputFormat === 'jpeg') {
            latestFrameBuffer = await sharpInstance.jpeg({ quality: CONFIG.quality }).toBuffer();
          } else {
            latestFrameBuffer = await sharpInstance.png({ compressionLevel: 6 }).toBuffer();
          }

          lastFrameType = `raw buffer → ${CONFIG.outputFormat.toUpperCase()} ✓`;
          console.log(`[✓] Frame ${frameCount}: Raw buffer → ${CONFIG.outputFormat.toUpperCase()} ${(latestFrameBuffer.length / 1024).toFixed(1)} KB`);

        } catch (error) {
          lastFrameType = 'raw buffer error';
          console.error(`[!] Raw buffer processing error:`, error.message);
        }
      } else {
        lastFrameType = 'unknown format';
        console.log(`[?] Frame ${frameCount}: Unknown format`);
      }

    } catch (error) {
      connectionErrors++;
      console.error('[!] Error processing frame:', error.message);
      lastFrameType = `error: ${error.message}`;
    }
  });

  ws.on('close', () => {
    clientCount--;
    console.log(`[✗] Client disconnected. Total: ${clientCount}`);
  });

  ws.on('error', (error) => {
    connectionErrors++;
    console.error('[!] WebSocket error:', error.message);
  });
});

// Periodic cleanup
setInterval(() => {
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
}, CONFIG.cleanupInterval);

// Statistics logging
setInterval(() => {
  if (frameCount > 0) {
    const uptime = Math.floor((Date.now() - serverStartTime) / 1000);
    console.log(`[📊] Frames: ${frameCount} | Clients: ${clientCount} | Data: ${(bytesReceived / 1024 / 1024).toFixed(2)} MB | Uptime: ${Math.floor(uptime / 60)}m ${uptime % 60}s`);
  }
}, CONFIG.statsInterval);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[!] Shutting down gracefully...');
  wss.clients.forEach(client => client.close());
  server.close(() => {
    console.log('[✓] Server stopped');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n[!] Received SIGTERM, shutting down...');
  process.exit(0);
});

// Start server
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  🎬 WebSocket Frame Server                                  ║
║                                                              ║
║  WebSocket: ws://localhost:${PORT}                           ║
║  Dashboard: http://localhost:${PORT}                         ║
║  Frame Output: http://localhost:${PORT}/frame.${CONFIG.outputFormat} ║
║  Stats API: http://localhost:${PORT}/stats                   ║
║                                                              ║
║  Format: ${CONFIG.outputFormat.toUpperCase()} | Quality: ${CONFIG.quality}%     ║
║  Status: ✓ RUNNING                                           ║
╚═══════════════════════════════════════════════════════════════╝

✓ Server ready to receive frames from 3D Engine!

  `);
});
