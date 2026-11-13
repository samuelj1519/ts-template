import { createApp } from './App';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('The root element is missing.');
root.replaceChildren(createApp());
