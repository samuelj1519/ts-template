import { fileURLToPath } from 'node:url';
import { checkTemplates, syncTemplates } from './assembly.ts';
import { updateLocks } from './locks.ts';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const command = process.argv[2];
if (command === 'sync') {
  await syncTemplates(root);
  process.stdout.write('Template payloads and the vanilla bootstrap were synchronized.\n');
} else if (command === 'check') {
  await checkTemplates(root);
  process.stdout.write(
    'All three template payloads and the vanilla bootstrap match their inputs.\n',
  );
} else if (command === 'locks') {
  await updateLocks(root);
  process.stdout.write('All three authoritative npm locks were regenerated.\n');
} else throw new Error('Use templates:sync, templates:check or templates:locks.');
