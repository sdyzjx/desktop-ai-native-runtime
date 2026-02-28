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
      overflowPolicy = 'drop_oldest',
      idleAction = null,
      afterIdleAction = null,
      mutex = null,
      onTelemetry = null,
      logger = console
    } = {}) {
      if (typeof executeAction !== 'function') {
        throw new Error('Live2dActionQueuePlayer requires executeAction function');
      }
      const normalizedOverflowPolicy = String(overflowPolicy || 'drop_oldest').trim().toLowerCase();
      if (!['drop_oldest', 'drop_newest', 'reject'].includes(normalizedOverflowPolicy)) {
        throw new Error('Live2dActionQueuePlayer overflowPolicy must be drop_oldest|drop_newest|reject');
      }
      this.executeAction = executeAction;
      this.sleep = sleep;
      this.tickMs = Math.max(5, Math.floor(Number(tickMs) || 50));
      this.maxQueueSize = Math.max(1, Math.floor(Number(maxQueueSize) || 120));
      this.overflowPolicy = normalizedOverflowPolicy;
      this.idleAction = idleAction && typeof idleAction === 'object' && !Array.isArray(idleAction)
        ? { ...idleAction }
        : null;
      this.afterIdleAction = typeof afterIdleAction === 'function'
        ? afterIdleAction
        : null;
      this.mutex = mutex;
      this.onTelemetry = onTelemetry;
      this.logger = logger;
      this.queue = [];
      this.loopRunning = false;
      this.activeStep = null;
      this.sequence = 0;
      this.idleWaiters = [];
      this.droppedCount = 0;
      this.idleActionApplied = false;
    }

    emitTelemetry(event, payload = {}) {
      if (typeof this.onTelemetry !== 'function') {
        return;
      }
      try {
        this.onTelemetry({
          event: String(event || ''),
          timestamp: Date.now(),
          queue_size: this.queue.length,
          ...payload
        });
      } catch {
        // ignore telemetry handler errors
      }
    }

    snapshot() {
      return {
        queueSize: this.queue.length,
        loopRunning: this.loopRunning,
        activeActionId: this.activeStep?.action?.action_id || null,
        droppedCount: this.droppedCount,
        idleActionApplied: this.idleActionApplied
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
      this.idleActionApplied = false;

      if (this.queue.length >= this.maxQueueSize) {
        if (this.overflowPolicy === 'reject') {
          throw new Error(`live2d action queue overflow (max=${this.maxQueueSize})`);
        }
        if (this.overflowPolicy === 'drop_newest') {
          this.droppedCount += 1;
          this.logger.warn?.('[live2d-action-player] queue overflow drop_newest', {
            action_id: actionId,
            queue_size: this.queue.length,
            max_queue_size: this.maxQueueSize
          });
          this.emitTelemetry('drop', {
            reason: 'queue_overflow_drop_newest',
            action_id: actionId
          });
          return {
            ok: false,
            dropped: true,
            reason: 'queue_overflow_drop_newest',
            action_id: actionId,
            queue_size: this.queue.length
          };
        }

        const dropCount = Math.max(1, this.queue.length - this.maxQueueSize + 1);
        this.queue.splice(0, dropCount);
        this.droppedCount += dropCount;
        this.logger.warn?.('[live2d-action-player] queue overflow drop_oldest', {
          dropped: dropCount,
          queue_size: this.queue.length,
          max_queue_size: this.maxQueueSize
        });
        this.emitTelemetry('drop', {
          reason: 'queue_overflow_drop_oldest',
          dropped: dropCount
        });
      }

      this.queue.push(nextAction);
      this.logger.info?.('[live2d-action-player] enqueue', {
        action_id: actionId,
        action_type: nextAction.action?.type || null,
        queue_size: this.queue.length
      });
      this.emitTelemetry('enqueue', {
        action_id: actionId,
        action_type: nextAction.action?.type || null
      });

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

    async applyIdleActionIfNeeded() {
      if (!this.idleAction || this.idleActionApplied) {
        return;
      }
      this.idleActionApplied = true;
      const runIdle = async () => {
        let idleError = null;
        try {
          this.logger.info?.('[live2d-action-player] idle fallback', {
            action_type: this.idleAction?.type || null,
            action_name: this.idleAction?.name || null
          });
          await this.executeAction(this.idleAction);
        } catch (err) {
          idleError = err;
          this.logger.warn?.('[live2d-action-player] idle fallback failed', {
            error: err?.message || String(err || 'unknown error')
          });
        }
        if (this.afterIdleAction) {
          try {
            await this.afterIdleAction({
              idleAction: this.idleAction,
              idleError
            });
          } catch (err) {
            this.logger.warn?.('[live2d-action-player] idle post-action failed', {
              error: err?.message || String(err || 'unknown error')
            });
          }
        }
      };

      if (this.mutex && typeof this.mutex.runExclusive === 'function') {
        await this.mutex.runExclusive(runIdle);
      } else {
        await runIdle();
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
            await this.applyIdleActionIfNeeded();
            this.loopRunning = false;
            this.resolveIdleWaiters();
            return;
          }

          const activeStep = {
            action: actionMessage,
            interrupted: false
          };
          this.activeStep = activeStep;
          this.logger.info?.('[live2d-action-player] start', {
            action_id: actionMessage.action_id,
            action_type: actionMessage.action?.type || null,
            queue_size: this.queue.length
          });
          this.emitTelemetry('start', {
            action_id: actionMessage.action_id,
            action_type: actionMessage.action?.type || null
          });

          const runAction = async () => {
            try {
              await this.executeAction(actionMessage.action);
            } catch (err) {
              this.logger.error?.('[live2d-action-player] execute failed', {
                action_id: actionMessage.action_id,
                error: err?.message || String(err || 'unknown error')
              });
              this.emitTelemetry('fail', {
                action_id: actionMessage.action_id,
                action_type: actionMessage.action?.type || null,
                error: err?.message || String(err || 'unknown error')
              });
            }
            await this.waitDuration(actionMessage.duration_sec, activeStep);
            this.logger.info?.('[live2d-action-player] done', {
              action_id: actionMessage.action_id,
              action_type: actionMessage.action?.type || null
            });
            this.emitTelemetry('done', {
              action_id: actionMessage.action_id,
              action_type: actionMessage.action?.type || null
            });
          };

          try {
            if (this.mutex && typeof this.mutex.runExclusive === 'function') {
              await this.mutex.runExclusive(runAction);
            } else {
              await runAction();
            }
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
