const { EventEmitter } = require('events');

const BUS_ALL_TOPIC = '__bus_all__';

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
    // Keep legacy wildcard listeners for existing gateway forwarding path.
    this.emitter.emit('*', topic, payload);
    // New all-topic stream for SSE/debug subscribers.
    this.emitter.emit(BUS_ALL_TOPIC, { topic, payload });
  }

  subscribe(topic, handler) {
    this.emitter.on(topic, handler);
    return () => this.emitter.off(topic, handler);
  }

  once(topic, handler) {
    this.emitter.once(topic, handler);
  }

  subscribeAll(handler) {
    this.emitter.on(BUS_ALL_TOPIC, handler);
    return () => this.emitter.off(BUS_ALL_TOPIC, handler);
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

module.exports = { RuntimeEventBus, BUS_ALL_TOPIC };
