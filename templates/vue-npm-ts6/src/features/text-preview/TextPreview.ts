import { computed, defineComponent, h, ref, vModelText, withDirectives } from 'vue';
import type { Ref } from 'vue';
import { normalizePreview } from './model';

function renderSource(input: {
  source: Ref<string>;
  element: Ref<HTMLTextAreaElement | undefined>;
  reset: () => void;
}) {
  return h('section', { class: 'source-section', 'aria-labelledby': 'source-heading' }, [
    h('h2', { id: 'source-heading' }, [h('label', { for: 'source-text' }, 'Source text')]),
    withDirectives(
      h('textarea', {
        ref: input.element,
        id: 'source-text',
        'aria-describedby': 'source-help',
        'onUpdate:modelValue': (value: string) => {
          input.source.value = value;
        },
        rows: 8,
      }),
      [[vModelText, input.source.value]],
    ),
    h('p', { id: 'source-help', class: 'field-help' }, 'Your text stays in this page.'),
    h('button', { type: 'button', onClick: input.reset }, 'Reset'),
  ]);
}

function renderResult(result: ReturnType<typeof normalizePreview>) {
  return h('section', { class: 'result-section', 'aria-labelledby': 'preview-heading' }, [
    h('h2', { id: 'preview-heading' }, 'Preview'),
    h(
      'output',
      { 'aria-label': 'Preview text', 'aria-live': 'polite', 'aria-atomic': 'true' },
      result.kind === 'empty' ? 'Enter text to see a preview.' : result.text,
    ),
  ]);
}

export const TextPreview = defineComponent({
  name: 'TextPreview',
  setup() {
    const source = ref('');
    const element = ref<HTMLTextAreaElement>();
    const preview = computed(() => normalizePreview(source.value));

    function reset(): void {
      source.value = '';
      element.value?.focus();
    }

    return () => {
      const result = preview.value;
      return h('div', { class: 'preview-workbench' }, [
        renderSource({ source, element, reset }),
        renderResult(result),
      ]);
    };
  },
});
