import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
const root = document.getElementById('root');
if (root === null) throw new Error('The root element is missing.');
createRoot(root).render(createElement(StrictMode, null, createElement(App)));
