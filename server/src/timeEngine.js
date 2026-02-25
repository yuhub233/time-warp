const { db, getSetting, setSetting } = require('./db');

class TimeEngine {
  constructor(config) {
    this.config = config;
    this.state = {
      activity: 'idle',
      sleeping: false,
      wokenUp: false,
      todayDate: null,
      irregularBaseTime: null,
      irregularElapsed: 0,
      lastTickReal: null,
      currentSpeed: 1.0,
      pomodoroActive: false,
      pomodoroStartReal: null,
      pomodoroPlannedMin: 25,
      pomodoroElapsedReal: 0,
      pomodoroBreak: false,
      pomodoroBreakCount: 0,
      entertainmentStartReal: null,
      todayEntertainmentReal: 0,
      todayStudyReal: 0,
      devices: {}
    };
    this.loadTodayState();
  }

  loadTodayState() {
    const today = this.getDateStr();
    const record = db.prepare('SELECT * FROM daily_records WHERE date = ?').get(today);
    if (record) {
      this.state.todayDate = today;
      if (record.irregular_wake_time) {
        this.state.irregularBaseTime = record.irregular_wake_time;
        this.state.wokenUp = true;
      }
      if (record.status === 'sleeping') this.state.sleeping = true;
      this.state.todayEntertainmentReal = record.actual_entertainment_min || 0;
      this.state.todayStudyReal = record.actual_study_min || 0;
    }
  }

  getDateStr(d) {
    const date = d || new Date();
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }

  timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  minutesToTime(min) {
    const totalMin = ((min % 1440) + 1440) % 1440;
    const h = Math.floor(totalMin / 60);
    const m = Math.floor(totalMin % 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }

  minutesToTimeWithSeconds(min) {
    const totalMin = ((min % 1440) + 1440) % 1440;
    const h = Math.floor(totalMin / 60);
    const remainder = (totalMin % 60);
    const m = Math.floor(remainder);
    const s = Math.floor((remainder - m) * 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  converge(current, target, rate) {
    const diff = target - current;
    return current + diff * rate;
  }

  getYesterdayRecord() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return db.prepare('SELECT * FROM daily_records WHERE date = ?').get(this.getDateStr(yesterday));
  }

  computeIrregularWakeTime(realWakeMinutes) {
    const targetWake = this.timeToMinutes(getSetting('targetWakeTime', '07:00'));
    const rate = getSetting('convergenceRate', 0.3);
    return this.converge(realWakeMinutes, targetWake, rate);
  }

  computeEntertainmentSpeed() {
    const targetEntMin = getSetting('targetEntertainmentMin', 120);
    const targetStudyMin = getSetting('targetStudyMin', 240);
    const targetSleep = this.timeToMinutes(getSetting('targetSleepTime', '23:00'));
    const rate = getSetting('convergenceRate', 0.3);

    const now = new Date();
    const realWakeMin = this.state.realWakeMinutes || this.timeToMinutes(`${now.getHours()}:${now.getMinutes()}`);

    const yesterdayRec = this.getYesterdayRecord();
    let yesterdaySleepMin;
    if (yesterdayRec && yesterdayRec.real_sleep_time) {
      yesterdaySleepMin = this.timeToMinutes(yesterdayRec.real_sleep_time);
    } else {
      yesterdaySleepMin = this.timeToMinutes(this.config.initialSleepTime);
    }

    const expectedSleepMin = this.converge(yesterdaySleepMin > 720 ? yesterdaySleepMin : yesterdaySleepMin + 1440, targetSleep < 720 ? targetSleep + 1440 : targetSleep, rate);
    const realAwakeMin = ((expectedSleepMin - realWakeMin) + 1440) % 1440;

    const irregularWakeMin = this.state.irregularWakeMinutes || this.computeIrregularWakeTime(realWakeMin);
    let yesterdayIrregSleep;
    if (yesterdayRec && yesterdayRec.irregular_sleep_time) {
      yesterdayIrregSleep = this.timeToMinutes(yesterdayRec.irregular_sleep_time);
    } else {
      yesterdayIrregSleep = targetSleep;
    }
    const irregularAwakeMin = ((yesterdayIrregSleep - irregularWakeMin) + 1440) % 1440;

    const irregularRestMin = irregularAwakeMin - targetEntMin - targetStudyMin;
    const realRestMin = realAwakeMin - targetEntMin - targetStudyMin;

    if (irregularRestMin <= 0 || realRestMin <= 0) return 1.0;

    const x = (realRestMin / irregularRestMin) * 2;
    return Math.max(0.1, Math.min(10, x));
  }

  getStudySpeed(elapsedRatio, settings) {
    const startSpeed = settings.studySpeedStart || 5.0;
    const endSpeed = settings.studySpeedEnd || 0.3;
    if (elapsedRatio >= 1.0) return endSpeed;
    const t = Math.min(elapsedRatio, 1.0);
    return startSpeed + (endSpeed - startSpeed) * (t * t);
  }

  getCurrentSpeed() {
    if (this.state.sleeping) return 0;
    if (this.state.pomodoroActive) {
      if (this.state.pomodoroBreak) return 1.0;
      const plannedMs = this.state.pomodoroPlannedMin * 60 * 1000;
      const elapsed = Date.now() - this.state.pomodoroStartReal;
      const ratio = elapsed / plannedMs;
      const settings = {
        studySpeedStart: getSetting('studySpeedStart', 5.0),
        studySpeedEnd: getSetting('studySpeedEnd', 0.3)
      };
      return this.getStudySpeed(ratio, settings);
    }
    if (this.state.activity === 'entertainment') {
      return this.state.entertainmentSpeed || this.computeEntertainmentSpeed();
    }
    return getSetting('idleSpeed', 0.5);
  }

  tick() {
    const now = Date.now();
    if (!this.state.lastTickReal) {
      this.state.lastTickReal = now;
      return;
    }
    const deltaMs = now - this.state.lastTickReal;
    this.state.lastTickReal = now;
    const speed = this.getCurrentSpeed();
    this.state.currentSpeed = speed;
    const irregularDeltaMin = (deltaMs / 60000) * speed;
    this.state.irregularElapsed += irregularDeltaMin;

    if (this.state.activity === 'entertainment') {
      this.state.todayEntertainmentReal += deltaMs / 60000;
    }
    if (this.state.pomodoroActive && !this.state.pomodoroBreak) {
      this.state.todayStudyReal += deltaMs / 60000;
    }
  }

  getIrregularTime() {
    if (!this.state.wokenUp || !this.state.irregularBaseTime) {
      const realNow = new Date();
      const realMin = realNow.getHours() * 60 + realNow.getMinutes();
      const irregWake = this.computeIrregularWakeTime(realMin);
      return this.minutesToTimeWithSeconds(irregWake);
    }
    this.tick();
    const baseMin = this.timeToMinutes(this.state.irregularBaseTime);
    const currentMin = baseMin + this.state.irregularElapsed;
    return this.minutesToTimeWithSeconds(currentMin);
  }

  getIrregularTimeMinutes() {
    if (!this.state.wokenUp || !this.state.irregularBaseTime) {
      const realNow = new Date();
      const realMin = realNow.getHours() * 60 + realNow.getMinutes();
      return this.computeIrregularWakeTime(realMin);
    }
    const baseMin = this.timeToMinutes(this.state.irregularBaseTime);
    return baseMin + this.state.irregularElapsed;
  }

  wakeUp() {
    const now = new Date();
    const realMin = now.getHours() * 60 + now.getMinutes();
    const irregWakeMin = this.computeIrregularWakeTime(realMin);
    const today = this.getDateStr();
    const entSpeed = this.computeEntertainmentSpeed();

    this.state.todayDate = today;
    this.state.wokenUp = true;
    this.state.sleeping = false;
    this.state.irregularBaseTime = this.minutesToTime(irregWakeMin);
    this.state.irregularWakeMinutes = irregWakeMin;
    this.state.realWakeMinutes = realMin;
    this.state.irregularElapsed = 0;
    this.state.lastTickReal = Date.now();
    this.state.currentSpeed = getSetting('idleSpeed', 0.5);
    this.state.activity = 'idle';
    this.state.entertainmentSpeed = entSpeed;
    this.state.todayEntertainmentReal = 0;
    this.state.todayStudyReal = 0;

    db.prepare(`INSERT OR REPLACE INTO daily_records 
      (date, real_wake_time, irregular_wake_time, real_wake_ts, target_entertainment_min, target_study_min, entertainment_speed, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'awake')`)
      .run(today, this.minutesToTime(realMin), this.state.irregularBaseTime, Date.now(),
        getSetting('targetEntertainmentMin', 120), getSetting('targetStudyMin', 240), entSpeed);

    return {
      realWakeTime: this.minutesToTime(realMin),
      irregularWakeTime: this.state.irregularBaseTime,
      entertainmentSpeed: entSpeed
    };
  }

  sleep() {
    const now = new Date();
    const realMin = now.getHours() * 60 + now.getMinutes();
    const today = this.getDateStr();
    const irregTime = this.getIrregularTime();

    this.state.sleeping = true;
    this.state.activity = 'sleeping';

    db.prepare(`UPDATE daily_records SET 
      real_sleep_time = ?, irregular_sleep_time = ?, real_sleep_ts = ?,
      actual_entertainment_min = ?, actual_study_min = ?, status = 'sleeping'
      WHERE date = ?`)
      .run(this.minutesToTime(realMin), irregTime.substring(0, 5), Date.now(),
        this.state.todayEntertainmentReal, this.state.todayStudyReal, today);

    return { realSleepTime: this.minutesToTime(realMin), irregularSleepTime: irregTime };
  }

  setActivity(activity, device, appName) {
    const prev = this.state.activity;
    this.tick();
    this.state.activity = activity;

    if (device) {
      this.state.devices[device] = { activity, appName, timestamp: Date.now() };
    }

    const isAnyDeviceEntertaining = Object.values(this.state.devices).some(d => d.activity === 'entertainment' && Date.now() - d.timestamp < 30000);
    if (isAnyDeviceEntertaining && activity !== 'study') {
      this.state.activity = 'entertainment';
    }

    db.prepare('INSERT INTO activity_log (timestamp, activity, device, app_name) VALUES (?, ?, ?, ?)')
      .run(Date.now(), activity, device || 'unknown', appName || '');

    return { activity: this.state.activity, speed: this.getCurrentSpeed() };
  }

  startPomodoro(durationMin) {
    this.tick();
    const planned = durationMin || getSetting('pomodoroWorkMin', 25);
    this.state.pomodoroActive = true;
    this.state.pomodoroStartReal = Date.now();
    this.state.pomodoroPlannedMin = planned;
    this.state.pomodoroElapsedReal = 0;
    this.state.pomodoroBreak = false;
    this.state.pomodoroBreakCount = 0;
    this.state.activity = 'study';

    const today = this.getDateStr();
    const now = new Date();
    db.prepare('INSERT INTO pomodoro_records (date, start_real_time, start_irregular_time, planned_duration_min) VALUES (?, ?, ?, ?)')
      .run(today, now.toISOString(), this.getIrregularTime(), planned);

    return { pomodoroId: db.prepare('SELECT last_insert_rowid() as id').get().id, planned };
  }

  pomodoroBreakToggle(isBreak) {
    this.tick();
    this.state.pomodoroBreak = isBreak;
    if (isBreak) this.state.pomodoroBreakCount++;
    return { break: isBreak, breakCount: this.state.pomodoroBreakCount, speed: this.getCurrentSpeed() };
  }

  endPomodoro() {
    this.tick();
    const now = new Date();
    const elapsed = (Date.now() - this.state.pomodoroStartReal) / 60000;

    const lastPomo = db.prepare('SELECT id FROM pomodoro_records ORDER BY id DESC LIMIT 1').get();
    if (lastPomo) {
      db.prepare('UPDATE pomodoro_records SET end_real_time = ?, end_irregular_time = ?, actual_real_duration_min = ?, break_count = ?, completed = 1 WHERE id = ?')
        .run(now.toISOString(), this.getIrregularTime(), elapsed, this.state.pomodoroBreakCount, lastPomo.id);
    }

    this.state.pomodoroActive = false;
    this.state.pomodoroBreak = false;
    this.state.activity = 'idle';
    return { realDuration: elapsed, breakCount: this.state.pomodoroBreakCount };
  }

  getStatus() {
    this.tick();
    const targetEntMin = getSetting('targetEntertainmentMin', 120);
    const threshold = getSetting('entertainmentWarningThreshold', 0.9);
    const entRatio = this.state.todayEntertainmentReal / targetEntMin;

    return {
      irregularTime: this.getIrregularTime(),
      realTime: new Date().toISOString(),
      speed: this.state.currentSpeed,
      activity: this.state.activity,
      sleeping: this.state.sleeping,
      wokenUp: this.state.wokenUp,
      todayEntertainmentMin: this.state.todayEntertainmentReal,
      todayStudyMin: this.state.todayStudyReal,
      entertainmentSpeed: this.state.entertainmentSpeed,
      entertainmentWarning: entRatio >= threshold,
      entertainmentExceeded: entRatio >= 1.0,
      entertainmentRatio: entRatio,
      pomodoroActive: this.state.pomodoroActive,
      pomodoroBreak: this.state.pomodoroBreak,
      pomodoroElapsedMin: this.state.pomodoroActive ? (Date.now() - this.state.pomodoroStartReal) / 60000 : 0,
      pomodoroPlannedMin: this.state.pomodoroPlannedMin
    };
  }

  saveSnapshot() {
    const status = this.getStatus();
    db.prepare('INSERT INTO time_snapshots (timestamp, real_time, irregular_time, speed, activity) VALUES (?, ?, ?, ?, ?)')
      .run(Date.now(), status.realTime, status.irregularTime, status.speed, status.activity);
  }
}

module.exports = TimeEngine;
