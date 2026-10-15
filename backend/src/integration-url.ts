/** Accept both a saved API base and a full OpenAI-compatible endpoint. */
export function aiApiBase(value: string): string {
  return value.trim().replace(/\/+$/, '').replace(/\/(?:chat\/completions|chat\/models-list|models)$/, '');
}

export function aiApiEndpoint(value: string, endpoint: 'chat/completions' | 'chat/models-list' | 'models'): string {
  return `${aiApiBase(value)}/${endpoint}`;
}

export function ssoApiEndpoint(value: string, endpoint: string): string {
  return `${value.trim().replace(/\/+$/, '')}/${endpoint}`;
}
