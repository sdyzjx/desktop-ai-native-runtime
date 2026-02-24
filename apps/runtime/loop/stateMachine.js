const RuntimeState = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  DONE: 'DONE',
  ERROR: 'ERROR',
  ABORTED: 'ABORTED'
};

class RuntimeStateMachine {
  constructor() {
    this.state = RuntimeState.IDLE;
  }

  transition(next) {
    this.state = next;
  }
}

module.exports = { RuntimeState, RuntimeStateMachine };
