
import React from 'react';
import ReactDOM from 'react-dom/client';
import { PublicClientApplication, EventType } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { msalConfig } from './authConfig';

// ── Initialize MSAL instance ──
const msalInstance = new PublicClientApplication(msalConfig);

// Set active account on login success
msalInstance.addEventCallback((event) => {
  if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
    const payload = event.payload as { account?: any };
    if (payload.account) {
      msalInstance.setActiveAccount(payload.account);
    }
  }
});

// Handle redirect promise (important for redirect flow)
msalInstance.initialize().then(() => {
  msalInstance.handleRedirectPromise().catch(err => {
    console.error('[MSAL] Redirect error:', err);
  });

  // Global Fetch Interceptor to inject MSAL Bearer Token
  const originalFetch = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const activeAccount = msalInstance.getActiveAccount();
    if (activeAccount) {
      try {
        const tokenResponse = await msalInstance.acquireTokenSilent({
          scopes: ['openid', 'profile', 'email'],
          account: activeAccount
        });
        
        const headers = new Headers(init?.headers);
        // Using idToken because it contains our custom App Roles
        headers.set('Authorization', `Bearer ${tokenResponse.idToken}`);
        
        return originalFetch(input, { ...init, headers });
      } catch (e) {
        console.warn('[Fetch Interceptor] Token acquisition failed', e);
      }
    }
    return originalFetch(input, init);
  };
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <MsalProvider instance={msalInstance}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MsalProvider>
  </React.StrictMode>
);
