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
  get_time: { type: 'local', run: () => getTime() },
  add: { type: 'local', run: add },
  echo: { type: 'local', run: echo }
};
