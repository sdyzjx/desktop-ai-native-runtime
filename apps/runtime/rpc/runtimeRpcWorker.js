const { v4: uuidv4 } = require('uuid');
const { RpcErrorCode, createRpcError, createRpcResult, toRpcEvent } = require('./jsonRpc');

class RuntimeRpcWorker {
  constructor({ queue, runner, bus }) {
    this.queue = queue;
    this.runner = runner;
    this.bus = bus;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stop() {
    this.running = false;
  }

  async loop() {
    while (this.running) {
      const envelope = await this.queue.pop();
      if (!envelope || !this.running) continue;
      await this.processEnvelope(envelope);
    }
  }

  async processEnvelope(envelope) {
    const { request, context } = envelope;

    if (request.method !== 'runtime.run') {
      if (request.id !== undefined) {
        context.send?.(createRpcError(request.id, RpcErrorCode.METHOD_NOT_FOUND, `method not found: ${request.method}`));
      }
      return;
    }

    const params = request.params || {};
    const input = typeof params.input === 'string' ? params.input : '';
    if (!input.trim()) {
      if (request.id !== undefined) {
        context.send?.(createRpcError(request.id, RpcErrorCode.INVALID_PARAMS, 'params.input must be non-empty string'));
      }
      return;
    }

    const sessionId = typeof params.session_id === 'string' && params.session_id
      ? params.session_id
      : `rpc-${uuidv4()}`;

    context.sendEvent?.(toRpcEvent('runtime.start', { session_id: sessionId, request_id: request.id ?? null }));

    const result = await this.runner.run({
      sessionId,
      input,
      onEvent: (event) => {
        this.bus.publish('runtime.event', event);
        context.sendEvent?.(toRpcEvent('runtime.event', event));
      }
    });

    const payload = {
      session_id: sessionId,
      output: result.output,
      trace_id: result.traceId,
      state: result.state
    };

    context.sendEvent?.(toRpcEvent('runtime.final', payload));

    if (request.id !== undefined) {
      context.send?.(createRpcResult(request.id, payload));
    }
  }
}

module.exports = { RuntimeRpcWorker };
