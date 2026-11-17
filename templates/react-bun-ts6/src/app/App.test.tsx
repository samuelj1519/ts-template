import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('presents the text tool in the main landmark', () => {
    render(<App />);

    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('heading', { level: 1, name: 'Text preview' }),
    );
    expect(screen.getByRole('textbox', { name: 'Source text' })).toBeVisible();
  });
});
