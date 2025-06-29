import React, { useState, useEffect, useRef } from 'react';
import { useReplStore } from '../store/replStore';

export const REPLInterface: React.FC = () => {
  const {
    messages,
    connectionState,
    sessionId,
    // socketId, // Not directly used here for socket operations
    addMessage,
  } = useReplStore();

  const [localCommand, setLocalCommand] = useState<string>('');
  const outputEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendCommand = () => {
    if (localCommand.trim() === '') return;

    if (connectionState === 'connected') {
      // Add user message to store. App.tsx will observe this and send via socket.
      addMessage('user', localCommand);
      setLocalCommand('');
    } else {
      addMessage('error', 'Cannot send command: Not connected to server.');
    }
  };

  return (
    <div>
      {/* Connection status can be displayed in App.tsx or here */}
      {/* <p>Connection: {connectionState} (Session: {sessionId || 'N/A'})</p> */}
      <div
        style={{
          height: '400px',
          overflowY: 'scroll',
          border: '1px solid #ccc',
          padding: '10px',
          backgroundColor: '#282c34',
          color: '#abb2bf',
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace',
          textAlign: 'left'
        }}
      >
        {messages.map((msg) => {
          let msgStyle: React.CSSProperties = {};
          if (msg.type === 'error') msgStyle.color = '#e06c75'; // Red
          else if (msg.type === 'system') msgStyle.color = '#61afef'; // Blue
          else if (msg.type === 'user') msgStyle.color = '#98c379'; // Green

          // Ensure content is treated as a string before splitting
          const contentString = String(msg.content || '');

          return (
            <div key={msg.id} style={msgStyle}>
              {contentString.split('\n').map((line, index, arr) => (
                <React.Fragment key={index}>
                  {line}
                  {index < arr.length - 1 && <br />}
                </React.Fragment>
              ))}
            </div>
          );
        })}
        <div ref={outputEndRef} />
      </div>
      <div style={{ display: 'flex', marginTop: '10px' }}>
        <input
          type="text"
          value={localCommand}
          onChange={(e) => setLocalCommand(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendCommand()}
          placeholder={connectionState === 'connected' ? "Enter command..." : "Not connected"}
          disabled={connectionState !== 'connected'}
          style={{
            flexGrow: 1,
            marginRight: '10px',
            padding: '8px',
            border: '1px solid #5c6370', // Darker border
            borderRadius: '4px',
            backgroundColor: '#21252b', // Darker input background
            color: '#abb2bf'
          }}
        />
        <button
          onClick={handleSendCommand}
          disabled={connectionState !== 'connected'}
          style={{
            padding: '8px 15px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: connectionState === 'connected' ? '#61afef' : '#4b5263', // Adjusted disabled color
            color: 'white',
            cursor: connectionState === 'connected' ? 'pointer' : 'not-allowed'
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
};
