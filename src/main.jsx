import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './styles-utilities.css';
import App from './App.jsx'; // <-- Main router app
// import App from './pages/Edit';
import { ThemeProvider } from './components/ThemeContext'; // <-- Global Theme Provider

// Development only: /?seed=<name> builds a sample document and opens it (src/dev/seed.js).
// The whole branch is removed from production builds.
let redirecting = false;
if (import.meta.env.DEV) {
  const name = new URLSearchParams(window.location.search).get('seed');
  if (name) {
    try {
      const { runSeed } = await import('./dev/seed');
      redirecting = await runSeed(name);
    } catch (error) {
      console.error('[seed]', error);
    }
  }
}

if (!redirecting) {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </StrictMode>,
  );
}
