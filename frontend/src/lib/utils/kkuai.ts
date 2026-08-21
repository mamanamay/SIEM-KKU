// KKU IntelSphere AI API — OpenAI-compatible
// base_url: https://gen.ai.kku.ac.th/api/v1

export const KKU_AI_BASE_URL = 'https://gen.ai.kku.ac.th/api/v1';

export const KKU_AI_MODELS = [
  { id: 'typhoon-v2-70b-instruct', name: 'Typhoon v2 70B (\u0e41\u0e19\u0e30\u0e19\u0e33)', provider: 'SCB Tech' },
  { id: 'typhoon-v2-8b-instruct', name: 'Typhoon v2 8B (\u0e40\u0e23\u0e47\u0e27)', provider: 'SCB Tech' },
  { id: 'llama-3.3-70b-instruct', name: 'Llama 3.3 70B', provider: 'Meta' },
  { id: 'llama-3.1-8b-instruct', name: 'Llama 3.1 8B (\u0e40\u0e23\u0e47\u0e27)', provider: 'Meta' },
  { id: 'wangchanglm-7.5b-instruct', name: 'WangchanLM 7.5B (Thai)', provider: 'VISTEC' },
];

export interface KKUAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function callKKUAI(
  apiKey: string,
  model: string,
  messages: KKUAIMessage[],
  onChunk?: (text: string) => void
): Promise<string> {
  if (!apiKey) throw new Error('KKU AI API Key not configured. Please set it in Account Center.');

  const response = await fetch(`${KKU_AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: !!onChunk,
      max_tokens: 2048,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any).error?.message || `API Error: ${response.status}`);
  }

  if (onChunk && response.body) {
    // Streaming mode
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter((l: string) => l.startsWith('data: '));
      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const text = json.choices?.[0]?.delta?.content || '';
          if (text) { fullText += text; onChunk(text); }
        } catch {
          // ignore parse errors on partial chunks
        }
      }
    }
    return fullText;
  } else {
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

// Test connection — sends a tiny "ping" to verify the API key works
export async function testKKUAIConnection(
  apiKey: string,
  model: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await callKKUAI(apiKey, model, [{ role: 'user', content: 'ping' }]);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Connection failed' };
  }
}

// localStorage helpers for API key per user
export function getKKUAIKey(): string {
  return localStorage.getItem('kkuai_api_key') || '';
}
export function setKKUAIKey(key: string): void {
  localStorage.setItem('kkuai_api_key', key);
}
export function getKKUAIModel(): string {
  return localStorage.getItem('kkuai_model') || KKU_AI_MODELS[0].id;
}
export function setKKUAIModel(model: string): void {
  localStorage.setItem('kkuai_model', model);
}
