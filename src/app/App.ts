import { createTextPreview } from '../features/text-preview';

export function createApp(): HTMLElement {
  const main = document.createElement('main');
  const header = document.createElement('header');
  header.className = 'page-heading';
  const title = document.createElement('h1');
  title.textContent = 'Text preview';
  const introduction = document.createElement('p');
  introduction.textContent = 'Trim the edges and combine spaces as you type.';
  header.append(title, introduction);
  main.append(header, createTextPreview());
  return main;
}
