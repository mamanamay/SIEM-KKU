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
  model: string,
  messages: KKUAIMessage[],
  onChunk?: (text: string) => void
): Promise<string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  
  const response = await fetch(`/api/admin/integrations/ai-proxy/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 2048,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any).message || `API Error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  if (onChunk) {
    // Simulate streaming for UI compatibility
    onChunk(content);
  }
  
  return content;
}

// Test connection — sends a tiny "ping" to verify the backend AI setup works
export async function testKKUAIConnection(
  model: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await callKKUAI(model, [{ role: 'user', content: 'ping' }]);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Connection failed' };
  }
}
