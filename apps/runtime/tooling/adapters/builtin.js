function getTime() {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

function add({ a, b }) {
  const x = Number(a);
  const y = Number(b);
  if (Number.isNaN(x) || Number.isNaN(y)) throw new Error('a/b must be number');
  return String(x + y);
}

function echo({ text }) {
  return `echo: ${text || ''}`;
}

module.exports = {
  'builtin.get_time': async () => getTime(),
  'builtin.add': async (args) => add(args),
  'builtin.echo': async (args) => echo(args)
};
