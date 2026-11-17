import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

const server = createServer();
await new Promise<void>((done, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', done);
});
const address = server.address();
if (address === null || typeof address === 'string') throw new Error('Cannot reserve a test port.');
const port = address.port;
await new Promise<void>((done, reject) =>
  server.close((error) => (error ? reject(error) : done())),
);

const result = spawnSync(
  process.execPath,
  [resolve('node_modules/@playwright/test/cli.js'), 'test', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      FRONTEND_TEST_PORT: String(port),
      FRONTEND_TEST_IDENTITY: randomBytes(16).toString('hex'),
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
