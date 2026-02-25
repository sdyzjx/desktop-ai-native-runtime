const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

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
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL, model = 'gpt-4o-mini', timeoutMs = 20000 } = {}) {
    if (!apiKey) {
      throw new Error('LLM_API_KEY is required for real LLM mode');
    }

    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  async decide({ messages, tools }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
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
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text();
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
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { OpenAIReasoner };
