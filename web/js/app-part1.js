let currentStatus = {};
let settings = {};
let fullscreenMode = null;
let pomodoroInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  api.connectWS();
  api.onMessage(handleWSMessage);
  settings = await api.getSettings();
  renderHome();
  renderPomodoro();
  renderSettings();
  setupNav();
  pollStatus();
});

function setupNav() {
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const page = a.dataset.page;
      document.querySelectorAll('.nav-links a').forEach(x => x.classList.remove('active'));
      a.classList.add('active');
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(`page-${page}`).classList.add('active');
      if (page === 'history') loadHistory();
      if (page === 'summary') loadSummaries();
      if (page === 'fullclock') enterFullClock();
    });
  });
}

async function pollStatus() {
  try { currentStatus = await api.getStatus(); } catch {}
  updateUI();
  setTimeout(pollStatus, 2000);
}

function handleWSMessage(data) {
  if (data.type === 'status') {
    currentStatus = data;
    updateUI();
  }
}

function updateUI() {
  const s = currentStatus;
  if (!s.irregularTime) return;
  const timeEl = document.getElementById('home-time');
  if (timeEl) timeEl.textContent = s.irregularTime;
  const speedEl = document.getElementById('home-speed');
  if (speedEl) {
    const spd = s.speed || 0;
    speedEl.textContent = `${spd.toFixed(2)}x`;
    speedEl.className = 'speed-badge ' + (spd > 1.5 ? 'fast' : spd < 0.8 ? 'slow' : 'normal');
  }
  const actEl = document.getElementById('home-activity');
  if (actEl) {
    const labels = { idle: '空闲', entertainment: '娱乐', study: '学习', sleeping: '睡眠中' };
    actEl.textContent = labels[s.activity] || s.activity;
  }
  updateStats(s);
  updateWarning(s);
  updateFullscreen(s);
  updatePomodoroUI(s);
}

function updateStats(s) {
  const entEl = document.getElementById('stat-entertainment');
  const studyEl = document.getElementById('stat-study');
  const entBar = document.getElementById('bar-entertainment');
  const studyBar = document.getElementById('bar-study');
  if (entEl) entEl.textContent = Math.round(s.todayEntertainmentMin || 0) + '分';
  if (studyEl) studyEl.textContent = Math.round(s.todayStudyMin || 0) + '分';
  const targetEnt = settings.targetEntertainmentMin || 120;
  const targetStudy = settings.targetStudyMin || 240;
  if (entBar) {
    const pct = Math.min(100, ((s.todayEntertainmentMin || 0) / targetEnt) * 100);
    entBar.style.width = pct + '%';
    entBar.className = 'progress-fill' + (pct >= 90 ? ' danger' : '');
  }
  if (studyBar) {
    const pct = Math.min(100, ((s.todayStudyMin || 0) / targetStudy) * 100);
    studyBar.style.width = pct + '%';
  }
}

function updateWarning(s) {
  const warn = document.getElementById('entertainment-warning');
  if (!warn) return;
  if (s.entertainmentWarning || s.entertainmentExceeded) {
    warn.classList.remove('hidden');
    warn.textContent = s.entertainmentExceeded
      ? '🚨 娱乐时间已超标！请立即停止娱乐！'
      : '⚠️ 娱乐时间即将达标！请注意控制！';
  } else {
    warn.classList.add('hidden');
  }
}

function updateFullscreen(s) {
  const el = document.getElementById('fullscreen-time');
  const info = document.getElementById('fullscreen-info');
  if (el && fullscreenMode) {
    el.textContent = s.irregularTime;
    if (fullscreenMode === 'pomodoro' && s.pomodoroActive) {
      const remaining = (s.pomodoroPlannedMin || 25) - (s.pomodoroElapsedMin || 0);
      const rm = Math.max(0, remaining);
      const mins = Math.floor(rm);
      const secs = Math.floor((rm - mins) * 60);
      info.textContent = `剩余 ${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')} | ${s.pomodoroBreak ? '休息中' : '专注中'}`;
    } else {
      const spd = (s.speed || 0).toFixed(2);
      const labels = { idle: '空闲', entertainment: '娱乐', study: '学习', sleeping: '睡眠中' };
      info.textContent = `${labels[s.activity] || ''} | ${spd}x`;
    }
  }
}

function renderHome() {
  const el = document.getElementById('page-home');
  el.innerHTML = `
    <div class="card">
      <div class="card-title">不常规时间</div>
      <div class="time-display" id="home-time">--:--:--</div>
      <div style="text-align:center;margin-bottom:16px">
        <span id="home-speed" class="speed-badge normal">--x</span>
        <span style="margin-left:12px;color:var(--text-dim)" id="home-activity">--</span>
      </div>
      <div class="btn-group" style="justify-content:center">
        <button class="btn btn-success" onclick="doWake()">☀️ 起床</button>
        <button class="btn btn-primary" onclick="doSleep()">🌙 睡觉</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title">今日统计</div>
      <div class="stat-grid">
        <div class="stat-item"><div class="stat-value" id="stat-entertainment">0分</div><div class="stat-label">娱乐时长</div><div class="progress-bar"><div class="progress-fill" id="bar-entertainment" style="width:0%"></div></div></div>
        <div class="stat-item"><div class="stat-value" id="stat-study">0分</div><div class="stat-label">学习时长</div><div class="progress-bar"><div class="progress-fill" id="bar-study" style="width:0%"></div></div></div>
        <div class="stat-item"><div class="stat-value" id="stat-ent-speed">--</div><div class="stat-label">娱乐流速</div></div>
        <div class="stat-item"><div class="stat-value" id="stat-real-time">--</div><div class="stat-label">真实时间</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">活动切换</div>
      <div class="btn-group">
        <button class="btn btn-outline" onclick="setAct('idle')">空闲</button>
        <button class="btn btn-outline" onclick="setAct('entertainment')">娱乐</button>
        <button class="btn btn-outline" onclick="setAct('study')">学习</button>
      </div>
    </div>
  `;
}

async function doWake() {
  const res = await api.wake();
  if (res.irregularWakeTime) alert('起床成功！不常规起床时间: ' + res.irregularWakeTime);
}

async function doSleep() {
  if (!confirm('确认睡觉？')) return;
  const res = await api.sleep();
  if (res.irregularSleepTime) alert('晚安！不常规睡觉时间: ' + res.irregularSleepTime);
}

async function setAct(activity) {
  await api.setActivity(activity, 'web', '');
}
