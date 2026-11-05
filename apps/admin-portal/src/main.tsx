import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initTheme, mountLiveChangeBar } from '@vmotiv/ui';
import { App } from './App.js';
import './styles.css';

initTheme();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
mountLiveChangeBar({ notifications: 'New notifications' });
