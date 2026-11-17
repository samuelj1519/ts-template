import { enableAutoUnmount } from '@vue/test-utils';
import { afterEach } from 'vitest';
import './matchers.ts';

enableAutoUnmount(afterEach);
afterEach(() => document.body.replaceChildren());
