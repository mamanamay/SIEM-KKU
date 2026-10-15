import { writable } from 'svelte/store';

export type NotificationType = 'success' | 'warning' | 'error' | 'processing' | 'info';

export interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
}

export const notificationStore = writable<Notification[]>([]);

let nextId = 1;

export function showNotification(type: NotificationType, title: string, message: string, duration?: number): number;
export function showNotification(title: string, message: string, type: NotificationType, duration?: number): number;
export function showNotification(message: string, type: NotificationType): number;
export function showNotification(first: string, second: string, third?: string, duration = 4000) {
  const types = ['success', 'warning', 'error', 'processing', 'info'];
  const type = (types.includes(first) ? first : third || second) as NotificationType;
  const title = types.includes(first) ? second : third ? first : type;
  const message = types.includes(first) ? third || '' : third ? second : first;
  const id = nextId++;
  notificationStore.update(n => [...n, { id, type, title, message }]);
  
  if (type !== 'processing') {
    setTimeout(() => {
      removeNotification(id);
    }, duration);
  }
  return id;
}

export function removeNotification(id: number) {
  notificationStore.update(n => n.filter(notif => notif.id !== id));
}
