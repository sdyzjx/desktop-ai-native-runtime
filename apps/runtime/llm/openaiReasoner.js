const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 300;

function parseToolArgs(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

class OpenAIReasoner {
  constructor({
    apiKey,
    baseUrl = DEFAULT_BASE_URL,
    model = 'gpt-4o-mini',
    timeoutMs = 20000,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS
  } = {}) {
    if (!apiKey) {
      throw new Error('LLM_API_KEY is required for real LLM mode');
    }

    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.maxRetries = Math.max(0, Number(maxRetries) || 0);
    this.retryDelayMs = Math.max(0, Number(retryDelayMs) || 0);
  }

  isRetriableStatus(status) {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }

  isRetriableNetworkError(err) {
    const raw = String(err?.message || '').toLowerCase();
    const causeRaw = String(err?.cause?.message || '').toLowerCase();
    const merged = `${raw} ${causeRaw}`;
    return (
      err?.name === 'AbortError'
      || merged.includes('fetch failed')
      || merged.includes('network')
      || merged.includes('socket')
      || merged.includes('timeout')
      || merged.includes('econnreset')
      || merged.includes('econnrefused')
      || merged.includes('etimedout')
      || merged.includes('eai_again')
      || merged.includes('enotfound')
    );
  }

  async waitBeforeRetry(attempt) {
    if (this.retryDelayMs <= 0) return;
    const backoffMs = this.retryDelayMs * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }

  async decide({ messages, tools }) {
    const payload = {
      model: this.model,
      temperature: 0.2,
      tool_choice: 'auto',
      messages,
      tools: tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.input_schema || { type: 'object', properties: {}, additionalProperties: true }
        }
      }))
    };

    let lastError = null;
    const totalAttempts = this.maxRetries + 1;

    for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        if (!response.ok) {
          const body = await response.text();
          if (this.isRetriableStatus(response.status) && attempt < this.maxRetries) {
            await this.waitBeforeRetry(attempt);
            continue;
          }
          throw new Error(`LLM request failed: ${response.status} ${body}`);
        }

        const data = await response.json();
        const message = data?.choices?.[0]?.message;
        if (!message) {
          throw new Error('LLM response missing choices[0].message');
        }

        const toolCalls = Array.isArray(message.tool_calls)
          ? message.tool_calls
            .filter((tc) => tc?.function?.name)
            .map((tc) => ({
              call_id: tc.id || null,
              name: tc.function.name,
              args: parseToolArgs(tc.function.arguments)
            }))
          : [];

        if (toolCalls.length > 0) {
          return {
            type: 'tool',
            assistantMessage: message,
            tool: toolCalls[0],
            tools: toolCalls
          };
        }

        const content = typeof message.content === 'string'
          ? message.content
          : Array.isArray(message.content)
            ? message.content.map((part) => part?.text || '').join('')
            : '';

        return {
          type: 'final',
          assistantMessage: message,
          output: content || '模型未返回文本输出。'
        };
      } catch (err) {
        lastError = err;
        if (attempt < this.maxRetries && this.isRetriableNetworkError(err)) {
          await this.waitBeforeRetry(attempt);
          continue;
        }
        break;
      } finally {
        clearTimeout(timer);
      }
    }

    const message = lastError?.message || String(lastError || 'unknown error');
    throw new Error(
      `LLM request failed after ${totalAttempts} attempt(s): ${message} (base_url=${this.baseUrl}, model=${this.model})`
    );
  }
}

module.exports = { OpenAIReasoner };
