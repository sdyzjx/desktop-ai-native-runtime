function getTime() {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

function add({ a, b }) {
  const x = Number(a);
  const y = Number(b);
  if (Number.isNaN(x) || Number.isNaN(y)) throw new Error('a/b 必须是数字');
  return String(x + y);
}

function echo({ text }) {
  return `echo: ${text || ''}`;
}

module.exports = {
  get_time: {
    type: 'local',
    description: 'Get local current date-time string in zh-CN locale.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    run: () => getTime()
  },
  add: {
    type: 'local',
    description: 'Add two numbers and return the sum.',
    input_schema: {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number' }
      },
      required: ['a', 'b'],
      additionalProperties: false
    },
    run: add
  },
  echo: {
    type: 'local',
    description: 'Echo user input text back to user.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string' }
      },
      required: ['text'],
      additionalProperties: false
    },
    run: echo
  }
};
