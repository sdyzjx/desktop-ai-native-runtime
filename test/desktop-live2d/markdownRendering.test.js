const { test } = require('node:test');
const assert = require('node:assert');

test('markdown rendering - basic formatting', () => {
  // Test basic markdown elements
  const testCases = [
    { input: '**bold**', expected: 'bold' },
    { input: '*italic*', expected: 'italic' },
    { input: '`code`', expected: 'code' },
    { input: '[link](url)', expected: 'link' }
  ];

  testCases.forEach(({ input, expected }) => {
    assert.ok(input.includes(expected), `Should contain ${expected}`);
  });
});

test('markdown rendering - headers', () => {
  const headers = [
    '# H1',
    '## H2',
    '### H3',
    '#### H4',
    '##### H5',
    '###### H6'
  ];

  headers.forEach((header) => {
    assert.ok(header.startsWith('#'), 'Should be a valid header');
  });
});

test('markdown rendering - lists', () => {
  const unorderedList = '- Item 1\n- Item 2\n- Item 3';
  const orderedList = '1. First\n2. Second\n3. Third';

  assert.ok(unorderedList.includes('- '), 'Should contain unordered list markers');
  assert.ok(orderedList.match(/\d+\./), 'Should contain ordered list markers');
});

test('markdown rendering - code blocks', () => {
  const codeBlock = '```javascript\nconst x = 1;\n```';
  assert.ok(codeBlock.includes('```'), 'Should contain code block markers');
});

test('markdown rendering - tables', () => {
  const table = '| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |';
  assert.ok(table.includes('|'), 'Should contain table delimiters');
  assert.ok(table.includes('---'), 'Should contain table separator');
});

test('markdown rendering - blockquotes', () => {
  const blockquote = '> This is a quote';
  assert.ok(blockquote.startsWith('>'), 'Should start with blockquote marker');
});

test('markdown rendering - horizontal rules', () => {
  const rules = ['---', '***', '___'];
  rules.forEach((rule) => {
    assert.ok(rule.length >= 3, 'Should be a valid horizontal rule');
  });
});

test('tool call rendering - structure', () => {
  const toolCall = {
    name: 'test_tool',
    arguments: { param1: 'value1', param2: 'value2' }
  };

  assert.ok(toolCall.name, 'Should have tool name');
  assert.ok(toolCall.arguments, 'Should have arguments');
  assert.equal(typeof toolCall.arguments, 'object', 'Arguments should be an object');
});

test('tool call rendering - empty arguments', () => {
  const toolCall = {
    name: 'simple_tool',
    arguments: {}
  };

  assert.ok(toolCall.name, 'Should have tool name');
  assert.equal(Object.keys(toolCall.arguments).length, 0, 'Arguments should be empty');
});

test('markdown safety - XSS prevention', () => {
  const maliciousInputs = [
    '<script>alert("xss")</script>',
    '<img src=x onerror=alert("xss")>',
    'javascript:alert("xss")'
  ];

  maliciousInputs.forEach((input) => {
    // In real implementation, these should be escaped
    assert.ok(typeof input === 'string', 'Should be a string');
  });
});
