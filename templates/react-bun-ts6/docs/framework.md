# React frontend

This preset uses React 19.3.1. `src/app/main.ts` mounts `App` through React DOM inside `StrictMode`. `App.tsx` composes the text-preview feature through its public entry.

The feature uses `useState` for source text and a ref for focus restoration. Its preview is derived through the shared pure model. Keep framework state and lifecycle logic in components; pure models do not import React.

Colocated component tests use React Testing Library and user-event. Cleanup unmounts React after each test. DOM assertions are registered in the shared test setup.

The build uses the official React Vite plugin and the `react-jsx` compiler setting. React Hooks rules supplement the common typed, accessibility, and architecture checks.

A migration to another UI framework rewrites components and their framework tests. Pure TypeScript models, behavior scenarios, styles, engineering checks, and project guidance remain reusable.

See [React components](https://react.dev/learn/describing-the-ui) and [state](https://react.dev/learn/state-a-components-memory).
