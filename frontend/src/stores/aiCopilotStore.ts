import { writable, get } from 'svelte/store';
import type { AiCopilotState, InvestigationSession, Message, AiMode, SecurityContext } from '../lib/AiCopilot/types';
const initialState: AiCopilotState = {
  isOpen: false,
  sessions: [],
  activeSessionId: null,
  globalConfig: {
    maxMessages: 20,
    maxContextSize: 10000 // Tokens approx
  }
};

function createAiCopilotStore() {
  // Try to load from local storage
  let savedState: any = null;
  if (typeof window !== 'undefined') {
    const currentUser = localStorage.getItem('username') || 'guest';
    const stored = localStorage.getItem(`kkusiem_ai_copilot_${currentUser}`);
    if (stored) {
      try {
        savedState = JSON.parse(stored);
      } catch (e) {
        console.error('Failed to parse saved ai copilot state', e);
      }
    }
  }

  const { subscribe, set, update } = writable<AiCopilotState>(savedState || initialState);

  // Subscribe and save to local storage
  if (typeof window !== 'undefined') {
    subscribe(state => {
      // Don't save isOpen state, always default to closed on reload
      const stateToSave = { ...state, isOpen: false };
      const currentUser = localStorage.getItem('username') || 'guest';
      localStorage.setItem(`kkusiem_ai_copilot_${currentUser}`, JSON.stringify(stateToSave));
    });
  }

  return {
    subscribe,
    set,
    update,
    
    togglePanel: () => update(s => ({ ...s, isOpen: !s.isOpen })),
    openPanel: () => update(s => ({ ...s, isOpen: true })),
    closePanel: () => update(s => ({ ...s, isOpen: false })),
    
    startNewSession: (initialContext: SecurityContext, mode: AiMode = 'local') => {
      const newSession: InvestigationSession = {
        id: crypto.randomUUID(),
        userId: (typeof window !== 'undefined' ? localStorage.getItem('username') : 'guest') || 'guest',
        title: 'New Investigation',
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        currentMode: mode,
        context: initialContext,
        messages: [],
        contextUsagePercent: 0,
        progress: []
      };
      
      update(s => {
        return {
          ...s,
          sessions: [newSession, ...s.sessions],
          activeSessionId: newSession.id,
          isOpen: true
        };
      });
      return newSession.id;
    },

    setActiveSession: (id: string) => update(s => ({ ...s, activeSessionId: id })),

    deleteSession: (id: string) => update(s => {
      const newSessions = s.sessions.filter(sess => sess.id !== id);
      return {
        ...s,
        sessions: newSessions,
        activeSessionId: s.activeSessionId === id ? (newSessions.length > 0 ? newSessions[0].id : null) : s.activeSessionId
      };
    }),


    addMessage: (sessionId: string, message: Message) => {
      update(s => {
        const sessionIdx = s.sessions.findIndex(sess => sess.id === sessionId);
        if (sessionIdx === -1) return s;
        
        const sessions = [...s.sessions];
        sessions[sessionIdx] = {
          ...sessions[sessionIdx],
          messages: [...sessions[sessionIdx].messages, message],
          lastActivity: new Date().toISOString(),
          // rough calculation: each message adds ~5% context usage
          contextUsagePercent: Math.min(100, sessions[sessionIdx].contextUsagePercent + 5)
        };
        
        // Auto-generate title if it's the first user message
        if (sessions[sessionIdx].messages.length === 1 && message.role === 'user') {
          sessions[sessionIdx].title = message.content.substring(0, 30) + (message.content.length > 30 ? '...' : '');
        }

        return { ...s, sessions };
      });
    },

    updateSessionMode: (sessionId: string, mode: AiMode) => {
      update(s => {
        const sessionIdx = s.sessions.findIndex(sess => sess.id === sessionId);
        if (sessionIdx === -1) return s;
        
        const sessions = [...s.sessions];
        sessions[sessionIdx] = {
          ...sessions[sessionIdx],
          currentMode: mode
        };
        return { ...s, sessions };
      });
    },

    updateSessionContext: (sessionId: string, contextUpdate: Partial<SecurityContext>) => {
       update(s => {
        const sessionIdx = s.sessions.findIndex(sess => sess.id === sessionId);
        if (sessionIdx === -1) return s;
        
        const sessions = [...s.sessions];
        sessions[sessionIdx] = {
          ...sessions[sessionIdx],
          context: { ...sessions[sessionIdx].context, ...contextUpdate }
        };
        return { ...s, sessions };
      });
    }
  };
}

export const aiCopilotStore = createAiCopilotStore();