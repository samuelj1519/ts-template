import { screen } from '@testing-library/dom';
import { describe, expect, it } from 'vitest';
import { createApp } from './App';

describe('App', () => {
  it('presents the text tool in the main landmark', () => {
    document.body.append(createApp());
    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('heading', { level: 1, name: 'Text preview' }),
    );
    expect(screen.getByRole('textbox', { name: 'Source text' })).toBeVisible();
  });
});
