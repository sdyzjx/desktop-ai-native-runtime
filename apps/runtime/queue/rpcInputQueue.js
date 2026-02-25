const { validateRpcRequest } = require('../rpc/jsonRpc');

class RpcInputQueue {
  constructor({ maxSize = 2000 } = {}) {
    this.maxSize = maxSize;
    this.items = [];
    this.waiters = [];
  }

  size() {
    return this.items.length;
  }

  async submit(payload, context = {}) {
    const parsed = validateRpcRequest(payload);
    if (!parsed.ok) {
      return { accepted: false, response: parsed.error };
    }

    if (this.items.length >= this.maxSize) {
      return {
        accepted: false,
        response: {
          jsonrpc: '2.0',
          id: parsed.request.id ?? null,
          error: { code: -32001, message: 'Input queue is full' }
        }
      };
    }

    const envelope = {
      request: parsed.request,
      context,
      accepted_at: Date.now()
    };

    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter(envelope);
    } else {
      this.items.push(envelope);
    }

    return { accepted: true };
  }

  async pop() {
    if (this.items.length > 0) {
      return this.items.shift();
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }
}

module.exports = { RpcInputQueue };
