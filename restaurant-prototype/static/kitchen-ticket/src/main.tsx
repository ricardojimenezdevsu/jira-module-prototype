import React from 'react';
import { createRoot } from 'react-dom/client';
import { view } from '@forge/bridge';
import App from './App.tsx';
import './styles.css';

// Ask Jira to pass its light/dark theme into the iframe. It sets data-color-mode on <html>
// and exposes Atlassian design tokens as CSS variables (--ds-*), which styles.css uses.
view.theme.enable();

const root = document.getElementById('root');
if (!root) throw new Error('index.html is missing <div id="root">');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
