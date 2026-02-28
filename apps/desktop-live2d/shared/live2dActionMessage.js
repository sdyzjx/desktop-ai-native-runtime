(function initLive2dActionMessage(globalScope) {
  const ACTION_EVENT_NAME = 'ui.live2d.action';
  const ACTION_ENQUEUE_METHOD = 'live2d.action.enqueue';
  const ALLOWED_ACTION_TYPES = new Set(['expression', 'motion', 'gesture', 'emote', 'react']);
  const ALLOWED_QUEUE_POLICIES = new Set(['append', 'replace', 'interrupt']);

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeString(value) {
    return String(value || '').trim();
  }

  function normalizeQueuePolicy(value) {
    const normalized = normalizeString(value || 'append').toLowerCase();
    if (!ALLOWED_QUEUE_POLICIES.has(normalized)) {
      return null;
    }
    return normalized;
  }

  function normalizeAction(rawAction) {
    if (!isObject(rawAction)) {
      return { ok: false, error: 'action must be an object' };
    }

    const type = normalizeString(rawAction.type).toLowerCase();
    if (!ALLOWED_ACTION_TYPES.has(type)) {
      return { ok: false, error: `unsupported action.type: ${type || '<empty>'}` };
    }

    const rawArgs = isObject(rawAction.args) ? rawAction.args : {};
    const args = { ...rawArgs };

    if (type === 'expression') {
      const name = normalizeString(rawAction.name || rawArgs.name);
      if (!name) {
        return { ok: false, error: 'expression action requires non-empty name' };
      }
      return {
        ok: true,
        value: {
          type,
          name,
          args: {}
        }
      };
    }

    if (type === 'motion') {
      const group = normalizeString(rawAction.name || rawArgs.group);
      if (!group) {
        return { ok: false, error: 'motion action requires non-empty group' };
      }

      const nextArgs = {
        group
      };

      if (Object.prototype.hasOwnProperty.call(rawArgs, 'index')) {
        const index = Number(rawArgs.index);
        if (!Number.isInteger(index) || index < 0) {
          return { ok: false, error: 'motion action args.index must be a non-negative integer' };
        }
        nextArgs.index = index;
      }

      return {
        ok: true,
        value: {
          type,
          name: group,
          args: nextArgs
        }
      };
    }

    const name = normalizeString(rawAction.name || rawArgs.name || rawArgs.type || rawArgs.intent || rawArgs.emotion);
    if (!name) {
      return { ok: false, error: `${type} action requires non-empty name` };
    }

    return {
      ok: true,
      value: {
        type,
        name,
        args
      }
    };
  }

  function normalizeLive2dActionMessage(rawPayload) {
    if (!isObject(rawPayload)) {
      return { ok: false, error: 'payload must be an object' };
    }

    const durationSec = Number(
      Object.prototype.hasOwnProperty.call(rawPayload, 'duration_sec')
        ? rawPayload.duration_sec
        : rawPayload.durationSec
    );

    if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > 120) {
      return { ok: false, error: 'duration_sec must be a finite number in (0, 120]' };
    }

    const normalizedQueuePolicy = normalizeQueuePolicy(rawPayload.queue_policy || rawPayload.queuePolicy || 'append');
    if (!normalizedQueuePolicy) {
      return { ok: false, error: 'queue_policy must be append|replace|interrupt' };
    }

    const normalizedAction = normalizeAction(rawPayload.action);
    if (!normalizedAction.ok) {
      return normalizedAction;
    }

    const actionId = normalizeString(rawPayload.action_id || rawPayload.actionId);

    return {
      ok: true,
      value: {
        action_id: actionId,
        action: normalizedAction.value,
        duration_sec: durationSec,
        queue_policy: normalizedQueuePolicy
      }
    };
  }

  const api = {
    ACTION_EVENT_NAME,
    ACTION_ENQUEUE_METHOD,
    ALLOWED_ACTION_TYPES,
    ALLOWED_QUEUE_POLICIES,
    normalizeLive2dActionMessage,
    normalizeAction,
    normalizeQueuePolicy
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.Live2DActionMessage = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
