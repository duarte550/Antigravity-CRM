
import { Configuration, LogLevel } from '@azure/msal-browser';

// ─────────────────────────────────────────────────────────
// MSAL Configuration — Microsoft Entra ID
// ─────────────────────────────────────────────────────────
// Valores são lidos de variáveis de ambiente (VITE_ENTRA_*)
// Configure seu .env com:
//   VITE_ENTRA_CLIENT_ID=<Application (client) ID>
//   VITE_ENTRA_TENANT_ID=<Directory (tenant) ID>
// ─────────────────────────────────────────────────────────

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID || '',
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID || 'common'}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage',
  },
  system: {
    loggerOptions: {
      logLevel: import.meta.env.DEV ? LogLevel.Warning : LogLevel.Error,
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:
            console.error('[MSAL]', message);
            break;
          case LogLevel.Warning:
            console.warn('[MSAL]', message);
            break;
          default:
            break;
        }
      },
    },
  },
};

// Scopes solicitados no login
export const loginRequest = {
  scopes: ['User.Read', 'openid', 'profile', 'email'],
};
