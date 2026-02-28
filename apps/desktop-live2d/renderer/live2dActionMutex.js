(function initLive2dActionMutex(globalScope) {
  class Live2dActionMutex {
    constructor() {
      this.tail = Promise.resolve();
      this.active = 0;
    }

    snapshot() {
      return {
        active: this.active
      };
    }

    runExclusive(task) {
      if (typeof task !== 'function') {
        throw new Error('Live2dActionMutex.runExclusive requires task function');
      }

      const runTask = async () => {
        this.active += 1;
        try {
          return await task();
        } finally {
          this.active = Math.max(0, this.active - 1);
        }
      };

      const wrapped = this.tail.then(runTask, runTask);
      this.tail = wrapped.catch(() => undefined);
      return wrapped;
    }
  }

  function createLive2dActionMutex() {
    return new Live2dActionMutex();
  }

  const api = {
    Live2dActionMutex,
    createLive2dActionMutex
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.Live2DActionMutex = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
