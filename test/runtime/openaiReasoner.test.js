const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { OpenAIReasoner } = require('../../apps/runtime/llm/openaiReasoner');
const { getFreePort } = require('../helpers/net');

function startMockServer(handler) {
  return new Promise(async (resolve, reject) => {
    const port = await getFreePort();
    const server = http.createServer(handler);
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ server, port }));
  });
}

test('OpenAIReasoner returns tool decision when tool_calls exists', async () => {
  const { server, port } = await startMockServer((req, res) => {
    if (req.url !== '/chat/completions') {
      res.writeHead(404).end();
      return;
    }

    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      choices: [{
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'add', arguments: '{"a":20,"b":22}' }
            }
          ]
        }
      }]
    }));
  });

  try {
    const reasoner = new OpenAIReasoner({ apiKey: 'k', baseUrl: `http://127.0.0.1:${port}`, model: 'mock' });
    const decision = await reasoner.decide({ messages: [{ role: 'user', content: 'x' }], tools: [] });

    assert.equal(decision.type, 'tool');
    assert.equal(decision.tool.name, 'add');
    assert.deepEqual(decision.tool.args, { a: 20, b: 22 });
  } finally {
    server.close();
  }
});

test('OpenAIReasoner returns final decision for text response', async () => {
  const { server, port } = await startMockServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      choices: [{
        message: {
          role: 'assistant',
          content: 'hello'
        }
      }]
    }));
  });

  try {
    const reasoner = new OpenAIReasoner({ apiKey: 'k', baseUrl: `http://127.0.0.1:${port}`, model: 'mock' });
    const decision = await reasoner.decide({ messages: [{ role: 'user', content: 'x' }], tools: [] });

    assert.equal(decision.type, 'final');
    assert.equal(decision.output, 'hello');
  } finally {
    server.close();
  }
});
