import BritiumGoLiveUXGuard from "./components/BritiumGoLiveUXGuard"
import "./styles/britium-go-live-ui-standard.css"
import SessionStuckRecovery from "./components/SessionStuckRecovery";
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/enterprise.css';
import PortalI18nRuntime from "./components/PortalI18nRuntime";

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <>
    <PortalI18nRuntime />
    <><SessionStuckRecovery /><><BritiumGoLiveUXGuard /><App /></></>
  </>
  </React.StrictMode>
);
