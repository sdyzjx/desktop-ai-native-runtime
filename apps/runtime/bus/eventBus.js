const { EventEmitter } = require('events');

class RuntimeEventBus {
  constructor({ maxListeners = 200 } = {}) {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(maxListeners);
  }

  publish(topic, payload) {
    if (topic.startsWith('ui.') || topic.startsWith('client.') || topic.startsWith('voice.')) {
      console.log(`[EventBus] 收到待转发事件: ${topic}`, JSON.stringify(payload));
    }
    this.emitter.emit(topic, payload);
    this.emitter.emit('*', topic, payload);
  }

  subscribe(topic, handler) {
    this.emitter.on(topic, handler);
    return () => this.emitter.off(topic, handler);
  }

  once(topic, handler) {
    this.emitter.once(topic, handler);
  }

  waitFor(topic, predicate, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const onMessage = (payload) => {
        try {
          if (!predicate || predicate(payload)) {
            cleanup();
            resolve(payload);
          }
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`waitFor timeout: ${topic}`));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        this.emitter.off(topic, onMessage);
      };

      this.emitter.on(topic, onMessage);
    });
  }
}

module.exports = { RuntimeEventBus };
