import { writable } from 'svelte/store';
import { io, Socket } from 'socket.io-client';

export const eventsStore = writable<any[]>([]);
export const socketStore = writable<Socket | null>(null);
export const roleStore = writable<string>('guest');
export const connectionState = writable<boolean>(false);

let socket: Socket | null = null;

export function initSocket() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/';
    return;
  }
  
  const role = localStorage.getItem('role') || 'guest';
  roleStore.set(role);

  if (socket) return; // already connected

  socket = io({
    path: '/socket.io/',
    auth: { token }
  });

  socket.on('connect', () => {
    connectionState.set(true);
  });

  socket.on('disconnect', () => {
    connectionState.set(false);
  });

  socket.on('initial_data', (data: any[]) => {
    eventsStore.set(data);
  });

  socket.on('new_attack', (data: any) => {
    eventsStore.update(events => [data, ...events]);
  });

  socket.on('connect_error', (err) => {
    if (err.message === 'Unauthorized') {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      window.location.href = '/';
    }
  });

  socketStore.set(socket);
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    socketStore.set(null);
    connectionState.set(false);
  }
}
