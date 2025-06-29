import { useEffect, useRef } from 'react'; // useState는 App.tsx에서 직접 사용하지 않음
import { useGoogleLogin, CodeResponse } from '@react-oauth/google';
import io, { Socket as SocketClient } from 'socket.io-client';
import './App.css';
import { useReplStore, MessageType as StoreMessageType, Message } from './store/replStore';
import { REPLInterface } from './components/REPLInterface'; // REPLInterface 임포트

function App() {
  const {
    messages, // REPLInterface에서 사용
    connectionState,
    sessionId,
    error, // REPLInterface 또는 App에서 표시 가능
    socketId,
    addMessage,
    setConnectionState,
    setSessionId,
    setError,
    setSocketId,
    resetSession,
  } = useReplStore();

  // localCommand는 REPLInterface로 이동
  const socketRef = useRef<SocketClient | null>(null);

  const handleLoginSuccess = async (code: string) => {
    // setConnectionState('connecting'); // 연결 시도 메시지는 REPLInterface나 여기서 직접 추가 가능
    addMessage('system', 'Attempting to authenticate with Google...');
    try {
      const response = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await response.json();
      if (response.ok && data.sessionId) {
        console.log('App.tsx: Session ID received from backend:', data.sessionId);
        addMessage('system', `Authentication successful. Session ID: ${data.sessionId}`);
        setSessionId(data.sessionId); // This will trigger the useEffect for socket connection
        setError(null);
      } else {
        const errMsg = data.message || 'Failed to get session ID from backend';
        console.error('App.tsx: ' + errMsg, data);
        setError(errMsg);
        addMessage('error', errMsg);
        setConnectionState('error'); // Set error state
      }
    } catch (err: any) {
      const errMsg = err.message || 'Error processing login';
      console.error('App.tsx: ' + errMsg, err);
      setError(errMsg);
      addMessage('error', errMsg);
      setConnectionState('error'); // Set error state
    }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: (codeResponse: CodeResponse) => {
      console.log('App.tsx: Google Auth code response:', codeResponse);
      handleLoginSuccess(codeResponse.code);
    },
    onError: (errorResponse) => {
      const errMsg = errorResponse.error_description || 'Google login failed';
      console.error('App.tsx: Google login error:', errorResponse);
      setError(errMsg);
      addMessage('error', errMsg);
      resetSession(); // Reset store session state
    },
    flow: 'auth-code',
  });

  // Effect for Socket.IO connection management
  useEffect(() => {
    if (sessionId && (connectionState !== 'connected' || !socketRef.current || socketRef.current.id !== socketId)) {
      if (socketRef.current) {
        console.log('App.tsx useEffect: Disconnecting previous socket instance.');
        socketRef.current.disconnect();
      }

      console.log(`App.tsx useEffect: Attempting to connect to Socket.IO with session ID: ${sessionId}`);
      setConnectionState('connecting');
      addMessage('system', `Connecting to server with session ${sessionId}...`);

      const newSocket = io({ auth: { sessionId }, reconnectionAttempts: 3 });
      socketRef.current = newSocket;

      newSocket.on('connect', () => {
        console.log('App.tsx Socket.IO connected:', newSocket.id);
        setSocketId(newSocket.id);
        setConnectionState('connected');
        setError(null);
        addMessage('system', 'Successfully connected to server.');
      });

      newSocket.on('disconnect', (reason) => {
        console.log('App.tsx Socket.IO disconnected:', reason);
        addMessage('system', `Disconnected from server: ${reason}`);
        setConnectionState('disconnected');
        if (socketRef.current?.id === newSocket.id) {
            socketRef.current = null;
            setSocketId(null);
        }
        if (reason === 'io server disconnect' || reason === 'transport error') {
            addMessage('system', 'Connection lost. Please try logging in again.');
            resetSession();
        }
      });

      newSocket.on('message', (msg: { type: StoreMessageType; content: string }) => {
        console.log('App.tsx Received message:', msg);
        addMessage(msg.type, msg.content); // Add message to store
        if (msg.type === 'system' && msg.content.includes('Terminal session ended')) {
          newSocket.disconnect();
        }
      });

      newSocket.on('connect_error', (err) => {
        console.error('App.tsx Socket.IO connection error:', err);
        const errMsg = `Socket connection error: ${err.message}.`;
        setError(errMsg);
        addMessage('error', errMsg);
        setConnectionState('error');
        if (socketRef.current?.id === newSocket.id) {
            socketRef.current = null;
            setSocketId(null);
        }
      });
    }

    return () => { // Cleanup on component unmount or when dependencies change
      if (socketRef.current) {
        console.log('App.tsx useEffect cleanup: Disconnecting socket', socketRef.current.id);
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [sessionId, connectionState, socketId, addMessage, setConnectionState, setSessionId, setError, resetSession, setSocketId]);

  // Effect for sending user commands from store to socket
  useEffect(() => {
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    if (lastMessage && lastMessage.type === 'user' && !lastMessage.id.startsWith('sent_')) {
      if (socketRef.current && connectionState === 'connected') {
        console.log('App.tsx useEffect [messages]: Sending user command to socket:', lastMessage.content);
        socketRef.current.emit('pty-input', lastMessage.content + '\r');
        // Mark message as sent to avoid resending (optional, if IDs are managed carefully)
        // This might require updating the message in the store, which can be complex.
        // A simpler way is to ensure REPLInterface only adds to store, and this effect handles sending.
        // To prevent re-sending, we could add a temporary flag to the message or manage IDs.
        // For now, this simple version sends any new 'user' message.
        // If REPLInterface already added it, and this effect runs, it's fine.
        // The key is that `addMessage` in REPLInterface should be the source of 'user' messages.
      } else if (connectionState !== 'connected' && lastMessage.type === 'user') {
        addMessage('error', 'Cannot send command: Not connected to server.');
      }
    }
  }, [messages, connectionState, addMessage]); // Depends on messages and connectionState

  const handleLogoutAndReset = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    resetSession();
    addMessage('system', 'Logged out and session cleared.');
  };

  return (
    <div className="App">
      <h1>Gemini CLI Web UI (Main App)</h1>
      {/* Global status and login/logout can remain in App.tsx */}
      <p>Global Connection: {connectionState} (Session: {sessionId || 'N/A'}, SocketID: {socketId || 'N/A'})</p>

      {connectionState === 'disconnected' && !sessionId && (
        <button onClick={() => googleLogin()}>
          Login with Google
        </button>
      )}
      {sessionId && (
         <button onClick={handleLogoutAndReset} style={{ marginLeft: '10px' }}>
           Logout & Reset
         </button>
      )}

      {error && <p style={{ color: 'red' }}>Global Error: {error}</p>}

      {/* REPLInterface is rendered if a session ID exists, allowing it to manage its view based on store state */}
      {sessionId && <REPLInterface />}

      {connectionState === 'connecting' && !sessionId && <p>Authenticating and connecting to server...</p>}
      {connectionState === 'connecting' && sessionId && <p>Connecting to PTY session...</p>}
    </div>
  );
}

export default App;
