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
  
  const response = await fetch(`/api/settings/integrations/ai-proxy/chat/completions`, {
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
    throw new Error(Array.isArray((err as any).message) ? (err as any).message.join(', ') : (err as any).message || `API Error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  if (typeof content !== 'string' || !content.trim()) throw new Error('AI_EMPTY_RESPONSE: AI ตอบกลับโดยไม่มีข้อความวิเคราะห์ กรุณาทดสอบการเชื่อมต่อใน Settings > Integrations');
  
  if (onChunk) {
    // Simulate streaming for UI compatibility
    onChunk(content);
  }
  
  return content;
}

// Test connection — sends a tiny "ping" to verify the backend AI setup works
export async function testKKUAIConnection(
  keyOrModel: string, model?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (model) {
      const response = await settingsRequest('/api/settings/integrations/test-ai', { aiKey: keyOrModel, aiModel: model, aiApiUrl: KKU_AI_BASE_URL });
      if (!response.success) throw new Error('Connection test failed');
    } else await callKKUAI(keyOrModel, [{ role: 'user', content: 'ping' }]);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Connection failed' };
  }
}

async function settingsRequest(url: string, body?: unknown) {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'AI settings request failed');
  return data;
}
export async function loadKKUAISettings() {
  const data = await settingsRequest('/api/settings');
  return { aiApiUrl: KKU_AI_BASE_URL, aiKey: '', aiModel: KKU_AI_MODELS[0].id, ...data.apiConfig };
}
export async function saveKKUAISettings(config: { aiKey: string; aiModel: string; aiApiUrl?: string }) {
  const existing = await loadKKUAISettings();
  await settingsRequest('/api/settings', { apiConfig: { ...existing, ...config } });
}
