const express = require('express');
const { db } = require('../db');

module.exports = function(aiSummary) {
  const router = express.Router();

  router.get('/daily', (req, res) => {
    const { date, from, to } = req.query;
    if (date) {
      const record = db.prepare('SELECT * FROM daily_records WHERE date = ?').get(date);
      return res.json(record || null);
    }
    const records = db.prepare('SELECT * FROM daily_records WHERE date >= ? AND date <= ? ORDER BY date DESC').all(from || '2020-01-01', to || '2099-12-31');
    res.json(records);
  });

  router.get('/pomodoros', (req, res) => {
    const { date, from, to } = req.query;
    if (date) {
      return res.json(db.prepare('SELECT * FROM pomodoro_records WHERE date = ? ORDER BY id DESC').all(date));
    }
    res.json(db.prepare('SELECT * FROM pomodoro_records WHERE date >= ? AND date <= ? ORDER BY id DESC').all(from || '2020-01-01', to || '2099-12-31'));
  });

  router.get('/snapshots', (req, res) => {
    const { date, limit } = req.query;
    const lim = parseInt(limit) || 500;
    if (date) {
      return res.json(db.prepare('SELECT * FROM time_snapshots WHERE real_time LIKE ? ORDER BY id DESC LIMIT ?').all(`${date}%`, lim));
    }
    res.json(db.prepare('SELECT * FROM time_snapshots ORDER BY id DESC LIMIT ?').all(lim));
  });

  router.get('/summaries', (req, res) => {
    const { type, period } = req.query;
    if (type && period) {
      const s = db.prepare('SELECT * FROM ai_summaries WHERE type = ? AND period = ? ORDER BY id DESC LIMIT 1').get(type, period);
      return res.json(s || null);
    }
    if (type) {
      return res.json(db.prepare('SELECT * FROM ai_summaries WHERE type = ? ORDER BY period DESC LIMIT 50').all(type));
    }
    res.json(db.prepare('SELECT * FROM ai_summaries ORDER BY id DESC LIMIT 50').all());
  });

  router.post('/summaries/generate', async (req, res) => {
    const { type, period } = req.body;
    try {
      let content;
      if (type === 'daily') content = await aiSummary.generateDailySummary(period);
      else if (type === 'weekly') content = await aiSummary.generateWeeklySummary(period);
      else if (type === 'monthly') content = await aiSummary.generateMonthlySummary(period);
      else return res.status(400).json({ error: 'Invalid type' });
      res.json({ content });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/activity-log', (req, res) => {
    const { date, limit } = req.query;
    const lim = parseInt(limit) || 200;
    if (date) {
      const start = new Date(`${date}T00:00:00`).getTime();
      const end = new Date(`${date}T23:59:59`).getTime();
      return res.json(db.prepare('SELECT * FROM activity_log WHERE timestamp >= ? AND timestamp <= ? ORDER BY id DESC LIMIT ?').all(start, end, lim));
    }
    res.json(db.prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?').all(lim));
  });

  return router;
};
