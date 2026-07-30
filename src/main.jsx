import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { startUpdateChecks } from './game/appUpdate'
import './styles.css'

// Watch for new builds. An installed PWA resumes instead of reloading, so without this a
// shipped change can sit live on the server while the home-screen app renders last week's.
startUpdateChecks()

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
