import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

async function forward(request: Request) {
  try {
    const target = env.API_TARGET || (env.NODE_ENV === 'production' ? 'http://backend:5000' : 'http://127.0.0.1:5000');
    const response = await fetch(target.replace(/\/$/, '') + '/api/network-map', { method: request.method, headers: { Authorization: request.headers.get('authorization') || '', 'Content-Type': 'application/json' }, ...(request.method === 'POST' ? { body: await request.text() } : {}) });
    return new Response(await response.text(), { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-SIEM-Network-Rule-Version': response.headers.get('X-SIEM-Network-Rule-Version') || '' } });
  } catch {
    return json({ message: 'Network policy backend is unavailable' }, { status: 502 });
  }
}

export function GET({ request }: { request: Request }) { return forward(request); }
export function POST({ request }: { request: Request }) { return forward(request); }
