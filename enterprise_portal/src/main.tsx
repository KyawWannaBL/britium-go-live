import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

const container = document.getElementById('root')

if (container) {
  try {
    createRoot(container).render(<App />)
  } catch (err) {
    // Last-resort: if the entire module chain fails before React renders,
    // show a visible error so we never get a blank white screen.
    container.innerHTML =
      '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;' +
      'background:#0A1628;color:#F5C842;font-family:monospace;padding:32px;box-sizing:border-box">' +
      '<div style="max-width:560px;width:100%">' +
      '<p style="font-size:11px;letter-spacing:0.15em;opacity:0.6;margin:0 0 8px">BRITIUM EXPRESS · STARTUP ERROR</p>' +
      '<h2 style="font-size:20px;font-weight:700;color:#fff;margin:0 0 16px">Application failed to start</h2>' +
      '<p style="font-size:13px;color:rgba(255,255,255,0.5);margin:0 0 12px">Possible cause: missing environment variables (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).</p>' +
      '<pre style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);' +
      'border-radius:8px;padding:16px;font-size:11px;color:#f87171;overflow:auto;white-space:pre-wrap">' +
      String(err) + '</pre></div></div>'
  }
} else {
  document.body.innerHTML =
    '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0A1628;color:#f87171;font-family:monospace">' +
    'Root element #root not found in index.html' +
    '</div>'
}
