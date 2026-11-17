import { screen } from '@testing-library/dom';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('presents the text tool in the main landmark', () => {
    mount(App, { attachTo: document.body });

    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('heading', { level: 1, name: 'Text preview' }),
    );
    expect(screen.getByRole('textbox', { name: 'Source text' })).toBeVisible();
  });
});
