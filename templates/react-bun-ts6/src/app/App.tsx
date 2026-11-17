import { TextPreview } from '../features/text-preview';

export function App() {
  return (
    <main>
      <header className="page-heading">
        <h1>Text preview</h1>
        <p>Trim the edges and combine spaces as you type.</p>
      </header>
      <TextPreview />
    </main>
  );
}
