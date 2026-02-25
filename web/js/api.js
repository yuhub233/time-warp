class API {
  constructor() {
    this.baseUrl = this.detectServer();
    this.ws = null;
    this.listeners = [];
  }

  detectServer() {
    const loc = window.location;
    if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
      return `http://${loc.hostname}:3100`;
    }
    return `http://${loc.hostname}:3100`;
  }

  setServer(url) {
    this.baseUrl = url.replace(/\/$/, '');
    this.connectWS();
  }

  async get(path) {
    const res = await fetch(`${this.baseUrl}${path}`);
    return res.json();
  }

  async post(path, data) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  connectWS() {
    if (this.ws) { try { this.ws.close(); } catch {} }
    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/ws';
    this.ws = new WebSocket(wsUrl);
    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        this.listeners.forEach(fn => fn(data));
      } catch {}
    };
    this.ws.onclose = () => { setTimeout(() => this.connectWS(), 3000); };
    this.ws.onerror = () => {};
  }

  onMessage(fn) { this.listeners.push(fn); }

  sendActivity(activity, device, appName) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'activity', activity, device, appName }));
    }
  }

  getStatus() { return this.get('/api/status'); }
  wake() { return this.post('/api/wake', {}); }
  sleep() { return this.post('/api/sleep', {}); }
  setActivity(activity, device, appName) { return this.post('/api/activity', { activity, device, appName }); }
  startPomodoro(min) { return this.post('/api/pomodoro/start', { durationMin: min }); }
  pomodoroBreak(isBreak) { return this.post('/api/pomodoro/break', { isBreak }); }
  endPomodoro() { return this.post('/api/pomodoro/end', {}); }
  getSettings() { return this.get('/api/settings'); }
  saveSettings(s) { return this.post('/api/settings', s); }
  getDailyRecords(from, to) { return this.get(`/api/data/daily?from=${from}&to=${to}`); }
  getPomodoros(date) { return this.get(`/api/data/pomodoros?date=${date}`); }
  getSummaries(type) { return this.get(`/api/data/summaries?type=${type}`); }
  getSummary(type, period) { return this.get(`/api/data/summaries?type=${type}&period=${period}`); }
  generateSummary(type, period) { return this.post('/api/data/summaries/generate', { type, period }); }
}

const api = new API();
