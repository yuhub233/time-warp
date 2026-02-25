const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const cron = require('node-cron');
const os = require('os');
const config = require('../config.json');
const { initDefaults } = require('./db');
const { encrypt, decrypt } = require('./crypto');
const TimeEngine = require('./timeEngine');
const AISummary = require('./aiSummary');
const apiRoutes = require('./routes/api');
const dataRoutes = require('./routes/data');

initDefaults(config);

const timeEngine = new TimeEngine(config);
const aiSummary = new AISummary(config);

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  if (req.headers['x-encrypted'] === 'true') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const decrypted = decrypt(body);
        req.body = JSON.parse(decrypted);
      } catch { /* use original body */ }
      next();
    });
  } else {
    next();
  }
});

app.use('/api', apiRoutes(timeEngine, aiSummary));
app.use('/api/data', dataRoutes(aiSummary));

app.use(express.static(path.join(__dirname, '..', '..', 'web')));

app.get('/api/server-info', (req, res) => {
  const nets = os.networkInterfaces();
  const lanIPs = [];
  for (const iface of Object.values(nets)) {
    for (const cfg of iface) {
      if (cfg.family === 'IPv4' && !cfg.internal) lanIPs.push(cfg.address);
    }
  }
  res.json({
    lanIPs,
    port: config.port,
    webPort: config.webPort,
    wanAddress: config.serverAddresses.wan
  });
});

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('message', (msg) => {
    try {
      let data;
      try { data = JSON.parse(decrypt(msg.toString())); } catch { data = JSON.parse(msg.toString()); }
      if (data.type === 'activity') {
        timeEngine.setActivity(data.activity, data.device, data.appName);
      }
    } catch {}
  });
  ws.on('close', () => clients.delete(ws));
});

setInterval(() => {
  const status = timeEngine.getStatus();
  const msg = JSON.stringify({ type: 'status', ...status });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}, 1000);

setInterval(() => { timeEngine.saveSnapshot(); }, 60000);

cron.schedule('0 0 * * *', async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
  await aiSummary.generateDailySummary(dateStr);
});

cron.schedule('0 1 * * 1', async () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  const weekStart = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  await aiSummary.generateWeeklySummary(weekStart);
});

cron.schedule('0 2 1 * *', async () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const month = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  await aiSummary.generateMonthlySummary(month);
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`Time Warp server on port ${config.port}`);
  console.log(`WebSocket on ws://0.0.0.0:${config.port}/ws`);
});

if (config.webPort !== config.port) {
  const webApp = express();
  webApp.use(express.static(path.join(__dirname, '..', '..', 'web')));
  webApp.listen(config.webPort, '0.0.0.0', () => {
    console.log(`Web client on port ${config.webPort}`);
  });
}
