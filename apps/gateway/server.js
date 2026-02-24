const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const tools = require('../runtime/executor/localTools');
const { ToolExecutor } = require('../runtime/executor/toolExecutor');
const { ToolLoopRunner } = require('../runtime/loop/toolLoopRunner');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const executor = new ToolExecutor(tools);
const runner = new ToolLoopRunner({ executor, maxStep: 6 });

app.get('/health', (_, res) => res.json({ ok: true }));

const server = app.listen(3000, () => {
  console.log('Debug web: http://localhost:3000');
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    if (msg.type !== 'run') return;

    const sessionId = msg.session_id || `web-${uuidv4()}`;
    const input = msg.input || '';

    ws.send(JSON.stringify({ type: 'start', session_id: sessionId, input }));

    const result = await runner.run({
      sessionId,
      input,
      onEvent: (evt) => ws.send(JSON.stringify({ type: 'event', data: evt }))
    });

    ws.send(JSON.stringify({ type: 'final', session_id: sessionId, output: result.output, trace_id: result.traceId }));
  });
});
