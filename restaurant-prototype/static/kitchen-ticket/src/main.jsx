import React from 'react';
import { createRoot } from 'react-dom/client';
import { view } from '@forge/bridge';
import App from './App.jsx';
import './styles.css';

// Ask Jira to pass its light/dark theme into the iframe. It sets data-color-mode on <html>
// and exposes Atlassian design tokens as CSS variables (--ds-*), which styles.css uses.
view.theme.enable();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
