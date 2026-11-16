import { describe, expect, it } from 'vitest';
import { normalizePreview } from './model';

describe('normalizePreview', () => {
  it('collapses internal whitespace and trims the ends', () => {
    expect(normalizePreview('  a \n\t b  ')).toEqual({
      kind: 'ready',
      text: 'a b',
    });
  });

  it('keeps already normalized text', () => {
    expect(normalizePreview('a b')).toEqual({ kind: 'ready', text: 'a b' });
  });

  it('represents blank input as an empty preview', () => {
    expect(normalizePreview(' \n\t ')).toEqual({ kind: 'empty' });
  });

  it('preserves Unicode text and normalizes Unicode whitespace', () => {
    expect(normalizePreview('\u00a0caf\u00e9\u2003\u2003\ud83c\udf3f\u3000')).toEqual({
      kind: 'ready',
      text: 'caf\u00e9 \ud83c\udf3f',
    });
  });

  it('represents an empty string as an empty preview', () => {
    expect(normalizePreview('')).toEqual({ kind: 'empty' });
  });
});
