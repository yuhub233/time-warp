const express = require('express');
const { db, getSetting, setSetting } = require('../db');

module.exports = function(timeEngine, aiSummary) {
  const router = express.Router();

  router.get('/status', (req, res) => {
    res.json(timeEngine.getStatus());
  });

  router.post('/wake', (req, res) => {
    const result = timeEngine.wakeUp();
    res.json(result);
  });

  router.post('/sleep', (req, res) => {
    const result = timeEngine.sleep();
    res.json(result);
  });

  router.post('/activity', (req, res) => {
    const { activity, device, appName } = req.body;
    const result = timeEngine.setActivity(activity, device, appName);
    res.json(result);
  });

  router.post('/pomodoro/start', (req, res) => {
    const { durationMin } = req.body;
    const result = timeEngine.startPomodoro(durationMin);
    res.json(result);
  });

  router.post('/pomodoro/break', (req, res) => {
    const { isBreak } = req.body;
    const result = timeEngine.pomodoroBreakToggle(isBreak);
    res.json(result);
  });

  router.post('/pomodoro/end', (req, res) => {
    const result = timeEngine.endPomodoro();
    res.json(result);
  });

  router.get('/settings', (req, res) => {
    const keys = [
      'targetWakeTime', 'targetSleepTime', 'targetEntertainmentMin', 'targetStudyMin',
      'pomodoroWorkMin', 'pomodoroBreakMin', 'pomodoroLongBreakMin', 'pomodoroSessionsBeforeLong',
      'studySpeedStart', 'studySpeedEnd', 'idleSpeed', 'convergenceRate',
      'floatingWindowSize', 'floatingWindowBgColor', 'floatingWindowTextColor',
      'entertainmentApps', 'fullscreenOrientation', 'entertainmentWarningThreshold'
    ];
    const settings = {};
    keys.forEach(k => { settings[k] = getSetting(k); });
    res.json(settings);
  });

  router.post('/settings', (req, res) => {
    const updates = req.body;
    for (const [k, v] of Object.entries(updates)) {
      setSetting(k, v);
    }
    res.json({ ok: true });
  });

  return router;
};
