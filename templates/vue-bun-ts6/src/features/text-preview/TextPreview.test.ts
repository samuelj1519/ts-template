import { screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { TextPreview } from './TextPreview';

describe('TextPreview', () => {
  it('starts with a labeled input and a useful empty preview', () => {
    mount(TextPreview, { attachTo: document.body });

    expect(screen.getByRole('textbox', { name: 'Source text' })).toHaveValue('');
    expect(screen.getByRole('status', { name: 'Preview text' })).toHaveTextContent(
      'Enter text to see a preview.',
    );
  });

  it('previews typed text while preserving the source', async () => {
    const user = userEvent.setup();
    mount(TextPreview, { attachTo: document.body });

    const source = screen.getByRole('textbox', { name: 'Source text' });
    await user.type(source, '  a {Enter}  b  ');

    expect(source).toHaveValue('  a \n  b  ');
    expect(screen.getByRole('status', { name: 'Preview text' })).toHaveTextContent('a b');
  });

  it('keeps a whitespace-only preview empty', async () => {
    const user = userEvent.setup();
    mount(TextPreview, { attachTo: document.body });

    await user.type(screen.getByRole('textbox', { name: 'Source text' }), '  {Enter} ');

    expect(screen.getByRole('status', { name: 'Preview text' })).toHaveTextContent(
      'Enter text to see a preview.',
    );
  });

  it('clears the text and returns keyboard focus to the source', async () => {
    const user = userEvent.setup();
    mount(TextPreview, { attachTo: document.body });

    const source = screen.getByRole('textbox', { name: 'Source text' });
    await user.type(source, 'A draft');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Reset' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(source).toHaveValue('');
    expect(source).toHaveFocus();
    expect(screen.getByRole('status', { name: 'Preview text' })).toHaveTextContent(
      'Enter text to see a preview.',
    );
  });
});
