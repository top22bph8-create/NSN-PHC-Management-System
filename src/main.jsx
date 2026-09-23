import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/sarabun/thai-400.css';
import '@fontsource/sarabun/thai-500.css';
import '@fontsource/sarabun/thai-600.css';
import '@fontsource/sarabun/thai-700.css';
import '@fontsource/sarabun/latin-400.css';
import '@fontsource/sarabun/latin-500.css';
import '@fontsource/sarabun/latin-600.css';
import '@fontsource/sarabun/latin-700.css';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
