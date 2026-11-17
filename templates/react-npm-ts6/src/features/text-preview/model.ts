type Preview = { readonly kind: 'empty' } | { readonly kind: 'ready'; readonly text: string };

export function normalizePreview(input: string): Preview {
  const text = input.trim().replace(/\s+/gu, ' ');

  return text.length === 0 ? { kind: 'empty' } : { kind: 'ready', text };
}
