const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LOW_SHELL_BINS,
  MEDIUM_EXTRA_SHELL_BINS,
  canReadLongTermMemory,
  canWriteLongTermMemory,
  isToolAllowedForPermission,
  getShellPermissionProfile
} = require('../../apps/runtime/security/sessionPermissionPolicy');

test('memory capabilities match low/medium/high policy', () => {
  assert.equal(canReadLongTermMemory('low'), false);
  assert.equal(canReadLongTermMemory('medium'), true);
  assert.equal(canReadLongTermMemory('high'), true);

  assert.equal(canWriteLongTermMemory('low'), false);
  assert.equal(canWriteLongTermMemory('medium'), false);
  assert.equal(canWriteLongTermMemory('high'), true);
});

test('tool permission policy gates memory tools by permission level', () => {
  assert.equal(isToolAllowedForPermission('memory_search', 'low'), false);
  assert.equal(isToolAllowedForPermission('memory_search', 'medium'), true);
  assert.equal(isToolAllowedForPermission('memory_search', 'high'), true);

  assert.equal(isToolAllowedForPermission('memory_write', 'low'), false);
  assert.equal(isToolAllowedForPermission('memory_write', 'medium'), false);
  assert.equal(isToolAllowedForPermission('memory_write', 'high'), true);

  assert.equal(isToolAllowedForPermission('add', 'low'), true);
  assert.equal(isToolAllowedForPermission('add', 'high'), true);
  assert.equal(isToolAllowedForPermission('persona.update_profile', 'low'), true);
  assert.equal(isToolAllowedForPermission('persona.update_profile', 'medium'), true);
  assert.equal(isToolAllowedForPermission('persona.update_profile', 'high'), true);
});

test('shell profile builds correct allowlist per permission level', () => {
  const low = getShellPermissionProfile('low');
  const medium = getShellPermissionProfile('medium');
  const high = getShellPermissionProfile('high');

  assert.equal(low.level, 'low');
  assert.ok(low.allowBins instanceof Set);
  for (const cmd of LOW_SHELL_BINS) {
    assert.equal(low.allowBins.has(cmd), true);
  }
  assert.equal(low.allowBins.has('curl'), false);

  assert.equal(medium.level, 'medium');
  assert.ok(medium.allowBins instanceof Set);
  for (const cmd of LOW_SHELL_BINS) {
    assert.equal(medium.allowBins.has(cmd), true);
  }
  for (const cmd of MEDIUM_EXTRA_SHELL_BINS) {
    assert.equal(medium.allowBins.has(cmd), true);
  }

  assert.equal(high.level, 'high');
  assert.equal(high.allowBins, null);
});
