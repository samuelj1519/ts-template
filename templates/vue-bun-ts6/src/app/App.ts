import { defineComponent, h } from 'vue';
import { TextPreview } from '../features/text-preview';

export const App = defineComponent({
  name: 'PreviewApplication',
  setup() {
    return () =>
      h('main', [
        h('header', { class: 'page-heading' }, [
          h('h1', 'Text preview'),
          h('p', 'Trim the edges and combine spaces as you type.'),
        ]),
        h(TextPreview),
      ]);
  },
});
