import { normalizePreview } from './model';

export function createTextPreview(): HTMLDivElement {
  const workbench = document.createElement('div');
  workbench.className = 'preview-workbench';
  const sourceSection = document.createElement('section');
  sourceSection.className = 'source-section';
  sourceSection.setAttribute('aria-labelledby', 'source-heading');
  const sourceHeading = document.createElement('h2');
  sourceHeading.id = 'source-heading';
  const label = document.createElement('label');
  label.htmlFor = 'source-text';
  label.textContent = 'Source text';
  sourceHeading.append(label);
  const source = document.createElement('textarea');
  source.id = 'source-text';
  source.rows = 8;
  source.setAttribute('aria-describedby', 'source-help');
  const help = document.createElement('p');
  help.id = 'source-help';
  help.className = 'field-help';
  help.textContent = 'Your text stays in this page.';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Reset';
  const resultSection = document.createElement('section');
  resultSection.className = 'result-section';
  resultSection.setAttribute('aria-labelledby', 'preview-heading');
  const resultHeading = document.createElement('h2');
  resultHeading.id = 'preview-heading';
  resultHeading.textContent = 'Preview';
  const output = document.createElement('output');
  output.setAttribute('aria-label', 'Preview text');
  output.setAttribute('aria-live', 'polite');
  output.setAttribute('aria-atomic', 'true');
  const update = (): void => {
    const preview = normalizePreview(source.value);
    output.textContent = preview.kind === 'empty' ? 'Enter text to see a preview.' : preview.text;
  };
  source.addEventListener('input', update);
  reset.addEventListener('click', () => {
    source.value = '';
    update();
    source.focus();
  });
  update();
  sourceSection.append(sourceHeading, source, help, reset);
  resultSection.append(resultHeading, output);
  workbench.append(sourceSection, resultSection);
  return workbench;
}
