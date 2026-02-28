const { randomUUID } = require('node:crypto');
const { buildRpcError } = require('./rpcValidator');

class IpcRpcBridge {
  constructor({
    ipcMain,
    webContents,
    invokeChannel = 'live2d:rpc:invoke',
    resultChannel = 'live2d:rpc:result',
    timeoutMs = 3000
  }) {
    this.ipcMain = ipcMain;
    this.webContents = webContents;
    this.invokeChannel = invokeChannel;
    this.resultChannel = resultChannel;
    this.timeoutMs = timeoutMs;
    this.pending = new Map();
    this.handleResult = this.handleResult.bind(this);
    this.ipcMain.on(this.resultChannel, this.handleResult);
  }

  async invoke({ method, params, timeoutMs }) {
    console.log(`准备调用前端方法: [${method}]`);
    console.log(`携带的参数是:`, params);
    if (!this.webContents || this.webContents.isDestroyed?.()) {
      throw buildRpcError(-32003, 'renderer unavailable');
    }

    const requestId = randomUUID();
    const effectiveTimeoutMs = Number(timeoutMs) > 0 ? Number(timeoutMs) : this.timeoutMs;

    const payload = {
      requestId,
      method,
      params,
      deadlineMs: effectiveTimeoutMs
    };

    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        console.error(`[Bridge] 超时！前端 ${effectiveTimeoutMs}ms 内没回信: ${requestId}`);
        reject(buildRpcError(-32003, `renderer timeout after ${effectiveTimeoutMs}ms`));
      }, effectiveTimeoutMs);

      this.pending.set(requestId, {
        resolve,
        reject,
        timer
      });
    });

    console.log(`[Bridge] 正在通过 IPC 发送包裹给前端:`, JSON.stringify(payload).substring(0, 150) + '...');
    this.webContents.send(this.invokeChannel, payload);
    return promise;
  }

  handleResult(_event, payload) {
    console.log(`[Bridge] 接收Result内容:`, payload);
    if (!payload || typeof payload !== 'object') {
      return;
    }
    const { requestId, result, error } = payload;
    if (!requestId || !this.pending.has(requestId)) {
      return;
    }

    const pending = this.pending.get(requestId);
    clearTimeout(pending.timer);
    this.pending.delete(requestId);

    if (error) {
      console.error(`[Bridge] 接收错误: ${JSON.stringify(error)}`);
      pending.reject(error);
      return;
    }
    console.log(`[Bridge] 前端执行成功！`);
    pending.resolve(result);
  }

  dispose() {
    this.ipcMain.off(this.resultChannel, this.handleResult);
    for (const [requestId, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(buildRpcError(-32003, `bridge disposed before response: ${requestId}`));
    }
    this.pending.clear();
  }
}

module.exports = { IpcRpcBridge };
