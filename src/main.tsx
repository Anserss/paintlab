import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { isDesktop } from './platform';
import './styles/tokens.css';
import './styles/base.css';
import './styles/texture.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

if (isDesktop()) document.body.classList.add('is-desktop');

createRoot(container).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
