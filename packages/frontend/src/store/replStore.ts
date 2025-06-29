import { create } from 'zustand';

export type MessageType = 'user' | 'assistant' | 'error' | 'system';
export type ConnectionStateType = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface Message {
  id: string; // 메시지 구분을 위한 ID (예: timestamp 또는 uuid)
  type: MessageType;
  content: string;
  timestamp: Date;
}

interface ReplStoreState {
  messages: Message[];
  connectionState: ConnectionStateType;
  sessionId: string | null;
  // currentCommand: string; // App.tsx에서 로컬 상태로 관리하는 것이 더 적합할 수 있음
  error: string | null; // General errors not tied to a message
  socketId: string | null; // To keep track of the current socket connection

  // Actions
  addMessage: (type: MessageType, content: string, id?: string) => void;
  setConnectionState: (state: ConnectionStateType) => void;
  setSessionId: (sessionId: string | null) => void;
  // setCurrentCommand: (command: string) => void;
  setError: (error: string | null) => void;
  setSocketId: (socketId: string | null) => void;
  clearMessages: () => void;
  resetSession: () => void; // Disconnect, clear session ID, messages, etc.
}

export const useReplStore = create<ReplStoreState>((set, get) => ({
  messages: [],
  connectionState: 'disconnected',
  sessionId: null,
  // currentCommand: '',
  error: null,
  socketId: null,

  addMessage: (type, content, id) => {
    const newMessage: Message = {
      id: id || Date.now().toString() + Math.random().toString(36).substring(2, 9), // Simple unique ID or provided
      type,
      content,
      timestamp: new Date(),
    };
    set((state) => ({ messages: [...state.messages, newMessage] }));
  },

  setConnectionState: (connectionState) => set({ connectionState }),

  setSessionId: (sessionId) => set({ sessionId }),

  // setCurrentCommand: (currentCommand) => set({ currentCommand }),

  setError: (error) => set({ error }),

  setSocketId: (socketId) => set({ socketId }),

  clearMessages: () => set({ messages: [] }),

  resetSession: () => {
    set({
      messages: [],
      connectionState: 'disconnected',
      sessionId: null,
      // currentCommand: '',
      error: null,
      socketId: null,
    });
    // Note: This resetSession does not handle socket disconnection itself.
    // That should be managed by the component using the store.
  },
}));

// Example of how to use in a component:
// const { messages, addMessage, connectionState, setConnectionState } = useReplStore();
//
// To add a message:
// addMessage('user', 'Hello from user');
//
// To update connection state:
// setConnectionState('connected');

// To select a part of the state (e.g., only messages):
// const messages = useReplStore(state => state.messages);
// This can be useful for performance optimization if components only need specific parts of the state.
