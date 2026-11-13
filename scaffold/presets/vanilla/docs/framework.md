# Native TypeScript frontend

This preset has no UI framework runtime dependency. `src/app/main.ts` inserts the element returned by `createApp()`. `createTextPreview()` creates native controls, derives its output through the pure model, and registers input and reset listeners.

Update user text through `textContent` and control values. Keep rendering code in the view and business transformations in the model.

Tests insert the actual elements into the DOM and drive them through user events. Test cleanup clears the document. The browser scenarios exercise the production build, keyboard focus, narrow layouts, themes, and accessible controls.

To adopt a framework later, explicitly integrate its dependencies, mounting code, component tests, compiler options, build plugins, and lifecycle cleanup. Preserve the same engineering protections and rerun complete acceptance. The React and Vue presets are ready alternatives when a framework is already selected.
