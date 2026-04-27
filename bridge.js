// acid-control bridge: phone web UI <-> macOS CoreMIDI <-> Ableton.
//
// Run once:    node bridge.js
// Phone:       open http://<MacBook IP>:8080  (System Settings > Wi-Fi shows IP)
// Ableton:     enable the new MIDI input ("acid-control") in
//              Settings > MIDI > Input, set Track + Remote = On,
//              then MIDI Learn any control to a fader/button on the phone UI.
//
// Bind is 0.0.0.0 so phones on the same Wi-Fi can reach it. If you don't want
// that, set HOST=127.0.0.1.
//
// PORT_NAME defaults to "acid-control" but can be overridden via the env var
// of the same name so existing MIDI Learn mappings don't break on rename
// (e.g. MIDI_PORT_NAME=touch-control node bridge.js).

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const easymidi = require('easymidi');

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const PORT_NAME = process.env.MIDI_PORT_NAME || 'acid-control';

// Open one virtual MIDI output. macOS exposes it to other apps automatically;
// no IAC Driver setup needed.
const midiOut = new easymidi.Output(PORT_NAME, true);
console.log(`[midi] opened virtual port "${PORT_NAME}" — enable it in Ableton Settings > MIDI`);

// Tiny static-file server for the phone UI. Anything under public/ is served
// at /. Defaults to index.html for /.
const publicDir = path.join(__dirname, 'public');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

function serveStatic(req, res) {
  let urlPath = decodeURI(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  // Resolve and confirm the resolved path is still within publicDir; rejects
  // any "../" traversal.
  const resolved = path.resolve(publicDir, '.' + urlPath);
  if (!resolved.startsWith(publicDir + path.sep) && resolved !== publicDir) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  fs.readFile(resolved, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') { res.writeHead(404); res.end('not found'); }
      else                       { res.writeHead(500); res.end('error');     }
      return;
    }
    const type = mimeTypes[path.extname(resolved)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

const server = http.createServer(serveStatic);

// WebSocket endpoint at /ws. Each message is a JSON object — see schema in the
// README header. Anything malformed is logged and dropped, never crashes.
// Accept WebSocket on any path so both /ws and / work — different UIs (mine,
// antigravity's, future) can connect without coordinating on the path.
const wss = new WebSocketServer({ server });

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function handleMessage(raw, ws) {
  let m;
  try { m = JSON.parse(raw); } catch { return; }
  const channel = clamp((m.channel | 0) || 1, 1, 16) - 1; // easymidi: 0-indexed
  switch (m.type) {
    case 'cc': {
      const controller = clamp(m.cc | 0, 0, 127);
      const value      = clamp(m.value | 0, 0, 127);
      midiOut.send('cc', { channel, controller, value });
      break;
    }
    case 'note': {
      const note     = clamp(m.note | 0, 0, 127);
      const velocity = clamp(m.value | 0, 0, 127);
      const event = velocity > 0 ? 'noteon' : 'noteoff';
      midiOut.send(event, { channel, note, velocity: velocity || 64 });
      break;
    }
    case 'pb': {
      // Pitch bend: -8192..8191 -> easymidi expects 0..16383
      const v = clamp((m.value | 0) + 8192, 0, 16383);
      midiOut.send('pitch', { channel, value: v });
      break;
    }
    case 'ping':
      try { ws.send(JSON.stringify({ type: 'pong', t: Date.now() })); } catch {}
      break;
    default:
      // Unknown message type — drop quietly so a buggy UI does not log-spam.
      break;
  }
}

wss.on('connection', (ws, req) => {
  const peer = req.socket.remoteAddress;
  console.log(`[ws] connect ${peer}`);
  ws.on('message', (data) => handleMessage(data.toString('utf8'), ws));
  ws.on('close',   () => console.log(`[ws] close   ${peer}`));
  ws.on('error',   (e) => console.log(`[ws] error   ${peer} ${e.message}`));
});

server.listen(PORT, HOST, () => {
  // Print every local IPv4 address so the user knows what to type into the
  // phone browser.
  const nets = require('os').networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name]) {
      if (ni.family === 'IPv4' && !ni.internal) ips.push(ni.address);
    }
  }
  console.log(`[http] serving ${publicDir} on http://${HOST}:${PORT}`);
  if (HOST === '0.0.0.0' && ips.length) {
    console.log('[http] reachable from phones on same Wi-Fi at:');
    for (const ip of ips) console.log(`         http://${ip}:${PORT}/`);
  }
});

process.on('SIGINT', () => { console.log('\nclosing'); midiOut.close(); process.exit(0); });
