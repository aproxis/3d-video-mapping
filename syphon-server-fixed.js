/**
 * Syphon Server - FIXED for data: URLs arriving as binary
 * 
 * The 3D Engine sends "data:image/..." strings
 * WebSocket receives them as binary buffers
 * This server converts them back to strings and processes
 * 
 * npm install ws express sharp
 * node syphon-server-fixed.js
 */

const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const sharp = require('sharp');

const PORT = 8080;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let latestImageBuffer = null;
let frameCount = 0;
let clientCount = 0;
let bytesReceived = 0;
let lastDataType = 'waiting...';

// Dashboard
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Syphon Server</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: monospace; 
          padding: 40px; 
          background: linear-gradient(135deg, #0f172a 0%, #1a1f35 100%);
          color: #f1f5f9;
        }
        .container { max-width: 1000px; margin: 0 auto; }
        h1 { margin-bottom: 30px; font-size: 32px; }
        .status { padding: 20px; background: rgba(16, 185, 129, 0.1); border: 2px solid #10b981; border-radius: 8px; margin-bottom: 30px; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric { padding: 20px; background: rgba(6, 182, 212, 0.1); border: 1px solid #06b6d4; border-radius: 8px; }
        .metric-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px; }
        .metric-value { font-size: 36px; color: #06b6d4; font-weight: bold; }
        .preview-section { margin-bottom: 30px; }
        .preview-title { font-size: 14px; color: #94a3b8; text-transform: uppercase; margin-bottom: 12px; }
        .preview-box { background: #000; border: 2px solid #334155; border-radius: 8px; padding: 10px; aspect-ratio: 16 / 9; display: flex; align-items: center; justify-content: center; }
        .preview-box img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px; }
        .info { padding: 20px; background: rgba(59, 130, 246, 0.1); border: 1px solid #3b82f6; border-radius: 8px; font-size: 13px; line-height: 1.8; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎬 Syphon Server</h1>
        
        <div class="status">
          ✓ Server Running on ws://localhost:${PORT}
        </div>
        
        <div class="metrics">
          <div class="metric">
            <div class="metric-label">Connected Clients</div>
            <div class="metric-value" id="clients">0</div>
          </div>
          <div class="metric">
            <div class="metric-label">Frames Received</div>
            <div class="metric-value" id="frames">0</div>
          </div>
          <div class="metric">
            <div class="metric-label">Data Type</div>
            <div class="metric-value" id="type" style="font-size: 16px;">waiting...</div>
          </div>
        </div>
        
        <div class="preview-section">
          <div class="preview-title">Live Preview</div>
          <div class="preview-box">
            <img id="preview" src="/preview.png?t=0" alt="Waiting for frames...">
          </div>
        </div>
        
        <div class="info">
          <strong>✓ How it works:</strong><br>
          1. 3D Engine sends data:image/... via WebSocket<br>
          2. Server decodes the base64 data<br>
          3. Converts to PNG with sharp<br>
          4. Displays at /preview.png<br>
          5. Use in TouchDesigner or VDMX
        </div>
      </div>
      
      <script>
        let t = 0;
        setInterval(() => {
          t++;
          fetch('/stats')
            .then(r => r.json())
            .then(d => {
              document.getElementById('clients').textContent = d.clients;
              document.getElementById('frames').textContent = d.frames;
              document.getElementById('type').textContent = d.type;
            });
          
          document.getElementById('preview').src = '/preview.png?t=' + t;
        }, 500);
      </script>
    </body>
    </html>
  `);
});

app.get('/stats', (req, res) => {
  res.json({
    clients: clientCount,
    frames: frameCount,
    type: lastDataType
  });
});

app.get('/preview.png', (req, res) => {
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'no-cache');
  res.set('Access-Control-Allow-Origin', '*');
  
  if (latestImageBuffer && latestImageBuffer.length > 100) {
    res.send(latestImageBuffer);
  } else {
    res.send(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222]));
  }
});

wss.on('connection', (ws) => {
  clientCount++;
  console.log(`[✓] Client connected. Total: ${clientCount}`);

  ws.on('message', async (data) => {
    try {
      frameCount++;
      let buffer = null;
      let dataString = null;
      
      // Step 1: Convert incoming data to string
      if (Buffer.isBuffer(data)) {
        // Check if it's a text data URL (starts with "data:")
        // Hex "64617461" = ASCII "data"
        if (data[0] === 0x64 && data[1] === 0x61 && data[2] === 0x74 && data[3] === 0x61) {
          dataString = data.toString('utf8');
        }
      } else if (typeof data === 'string') {
        dataString = data;
      }
      
      // Step 2: Process data URL
      if (dataString && dataString.startsWith('data:image')) {
        bytesReceived += dataString.length;
        
        // Extract base64 part
        const base64Start = dataString.indexOf(',') + 1;
        const base64Data = dataString.substring(base64Start);
        buffer = Buffer.from(base64Data, 'base64');
        
        try {
          // Convert to PNG
          latestImageBuffer = await sharp(buffer)
            .png({ quality: 100 })
            .toBuffer();
          
          lastDataType = 'data:image/* ✓';
          console.log(`[✓] Frame ${frameCount}: ${(dataString.length / 1024).toFixed(1)} KB → PNG ${(latestImageBuffer.length / 1024).toFixed(1)} KB`);
        } catch (error) {
          lastDataType = 'ERROR: ' + error.message;
          console.error(`[!] Frame ${frameCount}: ${error.message}`);
        }
      } else {
        lastDataType = 'unknown format';
        console.log(`[?] Frame ${frameCount}: Unknown format`);
      }
      
    } catch (error) {
      console.error('[!] Error:', error.message);
      lastDataType = 'error';
    }
  });

  ws.on('close', () => {
    clientCount--;
    console.log(`[✗] Client disconnected. Total: ${clientCount}`);
  });

  ws.on('error', (error) => {
    console.error('[!] WebSocket error:', error.message);
  });
});

server.listen(PORT, () => {
  console.log(`
╔═════════════════════════════════════════╗
║  🎬 Syphon Server - FIXED               ║
║                                         ║
║  WebSocket: ws://localhost:${PORT}       ║
║  Dashboard: http://localhost:${PORT}     ║
║  Preview: http://localhost:${PORT}/preview.png
║                                         ║
║  Status: ✓ RUNNING                      ║
╚═════════════════════════════════════════╝

✓ Server ready to receive frames!

  `);

  setInterval(() => {
    if (frameCount > 0) {
      console.log(`[📊] Frames: ${frameCount} | Type: ${lastDataType} | Data: ${(bytesReceived / 1024 / 1024).toFixed(2)} MB`);
    }
  }, 5000);
});

process.on('SIGINT', () => {
  console.log('\n[!] Shutting down...');
  server.close();
  process.exit(0);
});
