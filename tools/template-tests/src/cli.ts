import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { checkTemplates, syncTemplates } from './assembly.ts';
import { updateLocks } from './locks.ts';
import { enforceTs6Review } from '../../../scaffold/common/tools/checks/ts6-review.ts';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const command = process.argv[2];
if (command === 'sync') {
  await syncTemplates(root);
  process.stdout.write(
    'All twelve template payloads and the vanilla bootstrap were synchronized.\n',
  );
} else if (command === 'check') {
  enforceTs6Review(join(root, 'scaffold/common'), 'maintainer');
  await checkTemplates(root);
  process.stdout.write(
    'All twelve template payloads and the vanilla bootstrap match their inputs.\n',
  );
} else if (command === 'locks') {
  await updateLocks(root);
  process.stdout.write('All twelve authoritative locks were regenerated.\n');
} else throw new Error('Use templates:sync, templates:check or templates:locks.');
