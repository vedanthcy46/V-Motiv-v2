import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { mountLiveChangeBar } from './LiveChangeBar';
import { App } from './App.js';
import './styles.css';
import './approval.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
mountLiveChangeBar({ notifications: 'New notifications' });
