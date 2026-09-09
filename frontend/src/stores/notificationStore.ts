import { writable } from 'svelte/store';

export type NotificationType = 'success' | 'warning' | 'error' | 'processing';

export interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
}

export const notificationStore = writable<Notification[]>([]);

let nextId = 1;

export function showNotification(type: NotificationType, title: string, message: string, duration = 4000) {
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
