import { useRef, useState } from 'react';
import { normalizePreview } from './model';

export function TextPreview() {
  const [source, setSource] = useState('');
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const preview = normalizePreview(source);

  function reset(): void {
    setSource('');
    sourceRef.current?.focus();
  }

  return (
    <div className="preview-workbench">
      <section className="source-section" aria-labelledby="source-heading">
        <h2 id="source-heading">
          <label htmlFor="source-text">Source text</label>
        </h2>
        <textarea
          ref={sourceRef}
          id="source-text"
          aria-describedby="source-help"
          value={source}
          rows={8}
          onChange={(event) => {
            setSource(event.currentTarget.value);
          }}
        />
        <p id="source-help" className="field-help">
          Your text stays in this page.
        </p>
        <button type="button" onClick={reset}>
          Reset
        </button>
      </section>
      <section className="result-section" aria-labelledby="preview-heading">
        <h2 id="preview-heading">Preview</h2>
        <output aria-label="Preview text" aria-live="polite" aria-atomic="true">
          {preview.kind === 'empty' ? 'Enter text to see a preview.' : preview.text}
        </output>
      </section>
    </div>
  );
}
