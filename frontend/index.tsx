
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { MockAuthProvider } from './contexts/MockAuthContext';
import DevToggleBar from './components/DevToggleBar';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <MockAuthProvider>
      <App />
      <DevToggleBar />
    </MockAuthProvider>
  </React.StrictMode>
);
