import { createApp } from 'vue';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('The root element is missing.');
}

createApp(App).mount(root);
