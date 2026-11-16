import { resolve } from 'node:path';
import { preview } from 'vite';

const [portValue, identity] = process.argv.slice(2);
const port = Number(portValue);
if (
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535 ||
  !identity ||
  !/^[a-f0-9]{32}$/.test(identity)
) {
  throw new Error('Run npm run test:e2e to allocate an isolated port and test identity.');
}
const root = process.cwd();
await preview({
  root,
  configFile: false,
  build: { outDir: resolve(root, 'dist') },
  preview: { host: '127.0.0.1', port, strictPort: true },
  plugins: [
    {
      name: 'test-server-identity',
      configurePreviewServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url === `/__template_test_identity/${identity}`) {
            response.setHeader('Content-Type', 'text/plain');
            response.end(root);
          } else next();
        });
      },
    },
  ],
});
