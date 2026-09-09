import { writable } from 'svelte/store';

export const aiConfigStore = writable({
  isAiReady: typeof localStorage !== 'undefined' ? localStorage.getItem('isAiReady') !== 'false' : true
});

export function setAiReady(status: boolean) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('isAiReady', status.toString());
  }
  aiConfigStore.update(s => ({ ...s, isAiReady: status }));
}
