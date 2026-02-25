const { v4: uuidv4 } = require('uuid');
const { RpcErrorCode, createRpcError, createRpcResult, toRpcEvent } = require('./jsonRpc');

function normalizeInputImages(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;

  const images = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const dataUrl = typeof item.data_url === 'string' ? item.data_url.trim() : '';
    if (!dataUrl) return null;
    images.push({
      name: typeof item.name === 'string' ? item.name.trim() : '',
      mime_type: typeof item.mime_type === 'string' ? item.mime_type.trim() : '',
      size_bytes: Number(item.size_bytes) || 0,
      data_url: dataUrl
    });
  }

  return images;
}

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
    const inputImages = normalizeInputImages(params.input_images);
    if (inputImages === null) {
      if (request.id !== undefined) {
        context.send?.(createRpcError(request.id, RpcErrorCode.INVALID_PARAMS, 'params.input_images must be an array of image objects'));
      }
      return;
    }

    if (!input.trim() && inputImages.length === 0) {
      if (request.id !== undefined) {
        context.send?.(createRpcError(request.id, RpcErrorCode.INVALID_PARAMS, 'params.input must be non-empty string when params.input_images is empty'));
      }
      return;
    }

    const sessionId = typeof params.session_id === 'string' && params.session_id
      ? params.session_id
      : `rpc-${uuidv4()}`;

    let runtimeContext = {};
    let seedMessages = [];
    try {
      const prepared = await context.buildRunContext?.({
        request,
        session_id: sessionId,
        input,
        input_images: inputImages
      });
      if (prepared && typeof prepared === 'object' && !Array.isArray(prepared)) {
        runtimeContext = prepared;
      }
    } catch {
      // Context hooks should not break runtime execution.
    }

    try {
      const prepared = await context.buildPromptMessages?.({
        request,
        session_id: sessionId,
        input,
        input_images: inputImages,
        runtime_context: runtimeContext
      });
      if (Array.isArray(prepared)) {
        seedMessages = prepared;
      }
    } catch {
      // Context hooks should not break runtime execution.
    }

    try {
      await context.onRunStart?.({
        request,
        session_id: sessionId,
        input,
        input_images: inputImages,
        runtime_context: runtimeContext
      });
    } catch {
      // Persistence hooks should not break runtime execution.
    }

    context.sendEvent?.(toRpcEvent('runtime.start', { session_id: sessionId, request_id: request.id ?? null }));

    const result = await this.runner.run({
      sessionId,
      input,
      inputImages,
      seedMessages,
      runtimeContext,
      onEvent: (event) => {
        this.bus.publish('runtime.event', event);
        Promise.resolve(context.onRuntimeEvent?.(event)).catch(() => {});
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

    try {
      await context.onRunFinal?.({
        request,
        session_id: sessionId,
        input,
        input_images: inputImages,
        runtime_context: runtimeContext,
        ...payload
      });
    } catch {
      // Persistence hooks should not break runtime execution.
    }

    if (request.id !== undefined) {
      context.send?.(createRpcResult(request.id, payload));
    }
  }
}

module.exports = { RuntimeRpcWorker };
