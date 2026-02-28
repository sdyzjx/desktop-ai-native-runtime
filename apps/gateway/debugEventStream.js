const crypto = require('node:crypto');

function parseCsvTopics(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const topics = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (topics.length === 0) return null;
  if (topics.includes('*')) return null;
  return new Set(topics);
}

function resolveRequestedTopics(rawTopics) {
  return parseCsvTopics(rawTopics);
}

function topicMatches(topicFilters, topic) {
  if (!topicFilters) return true;
  const normalizedTopic = String(topic || '');
  for (const filter of topicFilters) {
    const token = String(filter || '').trim();
    if (!token) continue;
    if (token === '*') return true;
    if (token.endsWith('*')) {
      const prefix = token.slice(0, -1);
      if (normalizedTopic.startsWith(prefix)) return true;
      continue;
    }
    if (normalizedTopic === token) return true;
  }
  return false;
}

function extractBearerToken(req) {
  const auth = String(req.headers?.authorization || '');
  if (!auth.startsWith('Bearer ')) return '';
  return auth.slice(7).trim();
}

function extractTokenFromQuery(req) {
  const token = req?.query?.token;
  return typeof token === 'string' ? token.trim() : '';
}

class DebugEventStream {
  constructor({
    bus = null,
    authToken = '',
    allowedTopics = '*',
    heartbeatMs = 15000,
    bufferSize = 2000,
    globalMaxConnections = 200,
    perUserMaxConnections = 3
  } = {}) {
    this.bus = bus;
    this.authToken = String(authToken || '').trim();
    this.allowedTopics = parseCsvTopics(allowedTopics);
    this.heartbeatMs = Math.max(1000, Number(heartbeatMs) || 15000);
    this.bufferSize = Math.max(10, Number(bufferSize) || 2000);
    this.globalMaxConnections = Math.max(1, Number(globalMaxConnections) || 200);
    this.perUserMaxConnections = Math.max(1, Number(perUserMaxConnections) || 3);
    this.clients = new Map();
    this.buffer = [];
    this.seq = 0;
    this.unsubscribe = null;

    if (this.bus && typeof this.bus.subscribeAll === 'function') {
      this.unsubscribe = this.bus.subscribeAll(({ topic, payload }) => {
        this.pushEvent({
          event: 'log',
          topic: String(topic || 'runtime.event'),
          payload
        });
      });
    }
  }

  authenticate(req) {
    if (!this.authToken) {
      return {
        userId: 'anonymous',
        allowedTopics: this.allowedTopics
      };
    }

    const bearer = extractBearerToken(req);
    const queryToken = extractTokenFromQuery(req);
    const token = bearer || queryToken;
    if (!token || token !== this.authToken) {
      return null;
    }

    return {
      userId: 'bearer',
      allowedTopics: this.allowedTopics
    };
  }

  countUserConnections(userId) {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.userId === userId) count += 1;
    }
    return count;
  }

  stats() {
    return {
      clients: this.clients.size,
      buffer_size: this.buffer.length,
      latest_id: this.seq
    };
  }

  dispose() {
    if (typeof this.unsubscribe === 'function') {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    for (const client of this.clients.values()) {
      clearInterval(client.hbTimer);
      try {
        client.res.end();
      } catch {
        // ignore close errors
      }
    }
    this.clients.clear();
  }

  sseWrite(res, evt) {
    res.write(`id: ${evt.id}\n`);
    if (evt.event) {
      res.write(`event: ${evt.event}\n`);
    }
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  }

  pushEvent(evt) {
    const ts = Number(evt?.ts) || Date.now();
    const id = String(++this.seq);
    const record = {
      id,
      event: String(evt?.event || 'log'),
      topic: String(evt?.topic || 'runtime.event'),
      ts,
      ...((evt && typeof evt === 'object') ? evt : {})
    };
    record.id = id;
    record.ts = ts;
    record.event = String(record.event || 'log');
    record.topic = String(record.topic || 'runtime.event');

    this.buffer.push(record);
    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift();
    }

    for (const client of this.clients.values()) {
      if (!topicMatches(client.allowedTopics, record.topic)) {
        continue;
      }
      if (!topicMatches(client.requestedTopics, record.topic)) {
        continue;
      }
      this.sseWrite(client.res, record);
    }
    return record;
  }

  handleEmit(req, res) {
    const body = req.body || {};
    const topic = String(body.topic || '').trim();
    const msg = String(body.msg || '').trim();
    if (!topic || !msg) {
      res.status(400).json({ ok: false, error: 'topic/msg required' });
      return;
    }

    const payload = body && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? { ...body.payload }
      : {};
    const reserved = new Set(['topic', 'msg', 'event', 'level', 'payload']);
    for (const [key, value] of Object.entries(body)) {
      if (reserved.has(key)) continue;
      payload[key] = value;
    }
    payload.msg = msg;
    payload.level = String(body.level || 'info');

    const evt = this.pushEvent({
      event: String(body.event || 'log'),
      topic,
      payload
    });
    res.json({ ok: true, id: evt.id });
  }

  handleStream(req, res) {
    const principal = this.authenticate(req);
    if (!principal) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }

    if (this.clients.size >= this.globalMaxConnections) {
      res.status(503).json({ ok: false, error: 'debug stream is full' });
      return;
    }

    const userConnections = this.countUserConnections(principal.userId);
    if (userConnections >= this.perUserMaxConnections) {
      res.status(429).json({ ok: false, error: 'too many connections for this user' });
      return;
    }

    const requestedTopics = resolveRequestedTopics(req.query?.topics);
    const allowedTopics = principal.allowedTopics;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const clientId = crypto.randomUUID();
    const hbTimer = setInterval(() => {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    }, this.heartbeatMs);

    this.clients.set(clientId, {
      clientId,
      userId: principal.userId,
      requestedTopics,
      allowedTopics,
      connectedAt: Date.now(),
      hbTimer,
      res
    });

    res.write('retry: 3000\n\n');

    const lastEventId = String(req.headers['last-event-id'] || '').trim();
    const replayFrom = Number(lastEventId);
    if (Number.isFinite(replayFrom)) {
      for (const evt of this.buffer) {
        if (Number(evt.id) <= replayFrom) continue;
        if (!topicMatches(allowedTopics, evt.topic)) continue;
        if (!topicMatches(requestedTopics, evt.topic)) continue;
        this.sseWrite(res, evt);
      }
    }

    req.on('close', () => {
      clearInterval(hbTimer);
      this.clients.delete(clientId);
    });
  }
}

module.exports = { DebugEventStream };
