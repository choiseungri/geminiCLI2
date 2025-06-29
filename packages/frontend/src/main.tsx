import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { GoogleOAuthProvider } from '@react-oauth/google';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

if (!googleClientId) {
  console.error("VITE_GOOGLE_CLIENT_ID is not defined. Please check your .env file.");
  // 또는 사용자에게 오류를 표시하는 UI를 렌더링 할 수 있습니다.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {googleClientId ? (
      <GoogleOAuthProvider clientId={googleClientId}>
        <App />
      </GoogleOAuthProvider>
    ) : (
      <div>
        <h1>Configuration Error</h1>
        <p>Google Client ID is missing. Please contact support or check the console.</p>
      </div>
    )}
  </StrictMode>,
);
