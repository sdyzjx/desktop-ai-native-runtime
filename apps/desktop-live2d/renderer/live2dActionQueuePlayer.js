(function initLive2dActionQueuePlayer(globalScope) {
  function sleepMs(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, Math.max(0, Number(ms) || 0));
    });
  }

  class Live2dActionQueuePlayer {
    constructor({
      executeAction,
      sleep = sleepMs,
      tickMs = 50,
      maxQueueSize = 120,
      logger = console
    } = {}) {
      if (typeof executeAction !== 'function') {
        throw new Error('Live2dActionQueuePlayer requires executeAction function');
      }
      this.executeAction = executeAction;
      this.sleep = sleep;
      this.tickMs = Math.max(5, Math.floor(Number(tickMs) || 50));
      this.maxQueueSize = Math.max(1, Math.floor(Number(maxQueueSize) || 120));
      this.logger = logger;
      this.queue = [];
      this.loopRunning = false;
      this.activeStep = null;
      this.sequence = 0;
      this.idleWaiters = [];
    }

    snapshot() {
      return {
        queueSize: this.queue.length,
        loopRunning: this.loopRunning,
        activeActionId: this.activeStep?.action?.action_id || null
      };
    }

    enqueue(actionMessage) {
      if (!actionMessage || typeof actionMessage !== 'object' || Array.isArray(actionMessage)) {
        throw new Error('actionMessage must be an object');
      }
      const queuePolicy = String(actionMessage.queue_policy || 'append');
      if (queuePolicy === 'replace') {
        this.queue = [];
      } else if (queuePolicy === 'interrupt') {
        this.queue = [];
        this.interruptCurrent();
      }

      const actionId = String(actionMessage.action_id || '').trim()
        || `action-${Date.now()}-${++this.sequence}`;
      const nextAction = {
        ...actionMessage,
        action_id: actionId
      };

      this.queue.push(nextAction);
      if (this.queue.length > this.maxQueueSize) {
        this.queue.splice(0, this.queue.length - this.maxQueueSize);
      }

      void this.startLoop();

      return {
        ok: true,
        action_id: actionId,
        queue_size: this.queue.length
      };
    }

    interruptCurrent() {
      if (this.activeStep) {
        this.activeStep.interrupted = true;
      }
    }

    clear() {
      this.queue = [];
      return {
        ok: true,
        queue_size: 0
      };
    }

    stop() {
      this.loopRunning = false;
      this.interruptCurrent();
      this.clear();
      this.resolveIdleWaiters();
    }

    waitForIdle(timeoutMs = 3000) {
      if (!this.loopRunning && this.queue.length === 0 && !this.activeStep) {
        return Promise.resolve();
      }

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.idleWaiters = this.idleWaiters.filter((item) => item.resolve !== resolve);
          reject(new Error(`waitForIdle timeout after ${timeoutMs}ms`));
        }, Math.max(1, Number(timeoutMs) || 3000));

        this.idleWaiters.push({
          resolve: () => {
            clearTimeout(timer);
            resolve();
          }
        });
      });
    }

    resolveIdleWaiters() {
      if (this.loopRunning || this.queue.length > 0 || this.activeStep) {
        return;
      }
      const waiters = this.idleWaiters.splice(0, this.idleWaiters.length);
      for (const waiter of waiters) {
        waiter.resolve();
      }
    }

    async startLoop() {
      if (this.loopRunning) {
        return;
      }

      this.loopRunning = true;
      try {
        while (this.loopRunning) {
          const actionMessage = this.queue.shift();
          if (!actionMessage) {
            this.loopRunning = false;
            this.resolveIdleWaiters();
            return;
          }

          const activeStep = {
            action: actionMessage,
            interrupted: false
          };
          this.activeStep = activeStep;

          try {
            await this.executeAction(actionMessage.action);
          } catch (err) {
            this.logger.error?.('[live2d-action-player] execute failed', {
              action_id: actionMessage.action_id,
              error: err?.message || String(err || 'unknown error')
            });
          }

          try {
            await this.waitDuration(actionMessage.duration_sec, activeStep);
          } finally {
            this.activeStep = null;
          }
        }
      } finally {
        this.loopRunning = false;
        this.activeStep = null;
        this.resolveIdleWaiters();
      }
    }

    async waitDuration(durationSec, activeStep) {
      let remainingMs = Math.max(0, Math.round((Number(durationSec) || 0) * 1000));
      while (remainingMs > 0 && this.loopRunning && !activeStep.interrupted) {
        const chunk = Math.min(this.tickMs, remainingMs);
        await this.sleep(chunk);
        remainingMs -= chunk;
      }
    }
  }

  const api = {
    Live2dActionQueuePlayer
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.Live2DActionQueuePlayer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

