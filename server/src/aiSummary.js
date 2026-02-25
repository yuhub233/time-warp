const axios = require('axios');
const { db } = require('./db');

class AISummary {
  constructor(config) {
    this.config = config.ai;
  }

  async callAI(prompt) {
    const provider = this.config.provider || 'openai';
    if (provider === 'claude') {
      return this.callClaude(prompt);
    }
    return this.callOpenAI(prompt);
  }

  async callOpenAI(prompt) {
    const res = await axios.post(`${this.config.baseUrl}/chat/completions`, {
      model: this.config.model,
      messages: [
        { role: 'system', content: '你是一个作息管理助手，请根据用户的时间数据撰写总结和建议。使用中文回复。' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 2000
    }, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    return res.data.choices[0].message.content;
  }

  async callClaude(prompt) {
    const res = await axios.post(`${this.config.claudeBaseUrl}/messages`, {
      model: this.config.claudeModel,
      max_tokens: 2000,
      messages: [
        { role: 'user', content: prompt }
      ],
      system: '你是一个作息管理助手，请根据用户的时间数据撰写总结和建议。使用中文回复。'
    }, {
      headers: {
        'x-api-key': this.config.claudeApiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    });
    return res.data.content[0].text;
  }

  async generateDailySummary(date) {
    const record = db.prepare('SELECT * FROM daily_records WHERE date = ?').get(date);
    if (!record) return null;
    const pomos = db.prepare('SELECT * FROM pomodoro_records WHERE date = ?').all(date);
    const snapshots = db.prepare('SELECT * FROM time_snapshots WHERE real_time LIKE ?').all(`${date}%`);

    const prompt = `请为以下一天的数据撰写日总结：\n日期：${date}\n真实起床时间：${record.real_wake_time || '未记录'}\n不常规起床时间：${record.irregular_wake_time || '未记录'}\n真实睡觉时间：${record.real_sleep_time || '未记录'}\n不常规睡觉时间：${record.irregular_sleep_time || '未记录'}\n目标娱乐时长：${record.target_entertainment_min}分钟\n实际娱乐时长：${Math.round(record.actual_entertainment_min)}分钟\n目标学习时长：${record.target_study_min}分钟\n实际学习时长：${Math.round(record.actual_study_min)}分钟\n娱乐时间流速：${record.entertainment_speed?.toFixed(2) || 'N/A'}x\n番茄钟记录：${pomos.length}个，完成${pomos.filter(p=>p.completed).length}个\n时间快照数：${snapshots.length}条\n\n请分析作息规律性、学习效率、娱乐控制情况，并给出改进建议。`;

    try {
      const content = await this.callAI(prompt);
      db.prepare('INSERT INTO ai_summaries (type, period, content) VALUES (?, ?, ?)')
        .run('daily', date, content);
      return content;
    } catch (e) {
      console.error('AI daily summary error:', e.message);
      return null;
    }
  }

  async generateWeeklySummary(weekStart) {
    const dailies = db.prepare(
      "SELECT * FROM ai_summaries WHERE type = 'daily' AND period >= ? AND period < date(?, '+7 days') ORDER BY period"
    ).all(weekStart, weekStart);

    if (dailies.length === 0) return null;
    const prompt = `请根据以下7天的日总结，撰写周总结：\n\n${dailies.map(d => `【${d.period}】\n${d.content}`).join('\n\n')}\n\n请总结本周整体作息趋势、学习效率变化、需要改进的方面。`;

    try {
      const content = await this.callAI(prompt);
      db.prepare('INSERT INTO ai_summaries (type, period, content) VALUES (?, ?, ?)')
        .run('weekly', weekStart, content);
      return content;
    } catch (e) {
      console.error('AI weekly summary error:', e.message);
      return null;
    }
  }

  async generateMonthlySummary(month) {
    const weeklies = db.prepare(
      "SELECT * FROM ai_summaries WHERE type = 'weekly' AND period >= ? AND period < date(?, '+1 month') ORDER BY period"
    ).all(`${month}-01`, `${month}-01`);

    if (weeklies.length === 0) return null;
    const prompt = `请根据以下周总结，撰写月总结：\n\n${weeklies.map(w => `【${w.period}起一周】\n${w.content}`).join('\n\n')}\n\n请总结本月整体进步、习惯养成情况、下月目标建议。`;

    try {
      const content = await this.callAI(prompt);
      db.prepare('INSERT INTO ai_summaries (type, period, content) VALUES (?, ?, ?)')
        .run('monthly', month, content);
      return content;
    } catch (e) {
      console.error('AI monthly summary error:', e.message);
      return null;
    }
  }
}

module.exports = AISummary;
