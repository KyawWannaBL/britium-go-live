import "./enterprisePortalAuthGate";
import "./enterpriseFinalTouchBootstrap";
import "./dataEntryTariffAutocomplete";
import "./dataEntryGoLiveHardWire";
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './styles/printActionStudios.css';
import "./components/pickupRequestSubmitGuard";

import "./components/dataEntryHardFullscreenGuardV28";

import "./components/dataEntryFullscreenGuardV32";
import "./components/dataEntryFullscreenGuardV33";
import "./components/dataEntryRuntimeGuardV34";

// ─── GOOGLE TRANSLATE REACT CRASH PREVENTION SHIELD ───
// This monkey-patch intercepts native DOM mutations.
// When Google Translate corrupts text nodes, React normally throws a fatal 'removeChild' error.
// This safely bypasses the crash, making the app immune to translation extensions.
if (typeof window !== 'undefined' && typeof Node === 'function' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child: any) {
    if (child && child.parentNode !== this) {
      console.warn('React DOM safely bypassed Google Translate mutation (removeChild).');
      return child;
    }
    return originalRemoveChild.apply(this, arguments as any);
  };
  
  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (newNode: any, referenceNode: any) {
    if (referenceNode && referenceNode.parentNode !== this) {
      console.warn('React DOM safely bypassed Google Translate mutation (insertBefore).');
      return newNode;
    }
    return originalInsertBefore.apply(this, arguments as any);
  };
}
// ────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
