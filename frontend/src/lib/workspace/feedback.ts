import { writable } from 'svelte/store';

type Feedback = { title: string; message: string; confirm: boolean; resolve: (accepted: boolean) => void };
export const uiFeedback = writable<Feedback | null>(null);
const queue: Feedback[] = [];
let active = false;
function next() { active = queue.length > 0; uiFeedback.set(queue.shift() || null); }
function request(message: string, title: string, confirm: boolean) {
  return new Promise<boolean>(resolve => { queue.push({ title, message, confirm, resolve }); if (!active) next(); });
}
export function showUiMessage(message: string, title = 'การแจ้งเตือน') { return request(message, title, false); }
export function askUiConfirm(message: string, title = 'ยืนยันการดำเนินการ') { return request(message, title, true); }
export function settleUiFeedback(accepted: boolean) { uiFeedback.update(value => { value?.resolve(accepted); return null; }); next(); }
