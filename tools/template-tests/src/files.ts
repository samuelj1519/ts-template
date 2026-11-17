import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';

export type FileEntry = { readonly content: Buffer; readonly mode: number };
export type FileMap = ReadonlyMap<string, FileEntry>;

export const runtimePaths = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'artifacts',
  'reports',
  '.stryker-tmp',
  '.worktrees',
]);
const maintenancePaths = new Set([
  'CONTRIBUTING.md',
  '.github/workflows/template.yml',
  '.handoff',
  '.claude',
  '.cursor',
  'scaffold',
  'templates',
  'tools/template-tests',
]);

export function validPath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.includes('\\') &&
    !path.includes(':') &&
    !path.includes('\0') &&
    !posix.isAbsolute(path) &&
    posix.normalize(path) === path &&
    !path.split('/').some((part) => part === '..' || part === '.' || part === '')
  );
}

export function stripWindowsDriveNamespace(path: string): string {
  return path.replace(/^\\\\\?\\(?=[A-Za-z]:[\\/])/u, '');
}

function git(args: readonly string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

function workTreeRoot(directory: string): string | undefined {
  let current = directory;
  for (;;) {
    if (existsSync(join(current, '.git'))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function indexFileMode(mode: string): number {
  if (mode === '100644') return 0o644;
  if (mode === '100755') return 0o755;
  throw new Error(`Unexpected Git file mode: ${mode}`);
}

function parseIndexRecords(stdout: string): Map<string, number> {
  const modes = new Map<string, number>();
  if (stdout.length === 0) return modes;
  const records = stdout.split('\0');
  if (records.pop() !== '') throw new Error('Git returned a malformed index.');
  for (const record of records) {
    const tab = record.indexOf('\t');
    if (tab <= 0) throw new Error('Git returned a malformed index record.');
    const header = record.slice(0, tab).split(' ');
    const path = record.slice(tab + 1);
    if (header.length !== 3 || header[2] !== '0') throw new Error(`Unmerged Git path: ${path}`);
    if (!validPath(path)) throw new Error(`Unsafe repository path: ${path}`);
    modes.set(path, indexFileMode(header[0] ?? ''));
  }
  return modes;
}

function indexModes(directory: string): ReadonlyMap<string, number> | undefined {
  if (!workTreeRoot(directory)) return undefined;
  const result = git(['-C', stripWindowsDriveNamespace(directory), 'ls-files', '-s', '-z']);
  if (result.status !== 0) throw new Error(`Unable to read Git index modes: ${result.stderr}`);
  return parseIndexRecords(result.stdout);
}

function diskMode(absolute: string): number {
  return statSync(absolute).mode & 0o111 ? 0o755 : 0o644;
}

function recordedMode(
  modes: ReadonlyMap<string, number> | undefined,
  path: string,
  absolute: string,
): number {
  return modes?.get(path) ?? diskMode(absolute);
}

export function ensureTrackedExecutable(root: string, path: string): void {
  if (!validPath(path)) throw new Error(`Unsafe output path: ${path}`);
  if (!existsSync(join(root, '.git'))) return;
  const cwd = stripWindowsDriveNamespace(root);
  const listed = git(['-C', cwd, 'ls-files', '-s', '-z', '--', path]);
  if (listed.status !== 0) throw new Error(`Unable to read Git index mode: ${listed.stderr}`);
  if (listed.stdout.startsWith('100755 ')) return;
  const added = git(['-C', cwd, 'add', '--chmod=+x', '--', path]);
  if (added.status !== 0)
    throw new Error(
      `Unable to record executable mode for ${path}: ${added.stderr || added.stdout}`,
    );
}

export function realDirectory(path: string): void {
  const entry = lstatSync(path);
  if (!entry.isDirectory() || entry.isSymbolicLink())
    throw new Error(`Expected a real directory: ${path}`);
}

export function rootExcluded(path: string): boolean {
  if (runtimePaths.has(path) || maintenancePaths.has(path)) return true;
  if (path.startsWith('.handoff/')) return true;
  if (path === '.claude' || path.startsWith('.claude/')) return true;
  if (path === '.cursor' || path.startsWith('.cursor/')) return true;
  return false;
}

const templateInstallResidualRoots = new Set(['.npm', '.bun']);
const templateRuntimeOutputRoots = new Set([
  'dist',
  'coverage',
  'artifacts',
  'reports',
  '.stryker-tmp',
  '.worktrees',
]);

export function templatePayloadExcluded(path: string): boolean {
  const parts = path.split('/');
  if (parts.some((part) => part === 'node_modules')) return true;
  const root = parts[0];
  if (root !== undefined && templateInstallResidualRoots.has(root)) return true;
  return root !== undefined && templateRuntimeOutputRoots.has(root);
}

export function readFiles(root: string, exclude: (path: string) => boolean = () => false): FileMap {
  realDirectory(root);
  const modes = indexModes(root);
  const found = new Map<string, FileEntry>();
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const path = relative(root, absolute).split(sep).join('/');
      if (exclude(path)) continue;
      if (!validPath(path) || entry.isSymbolicLink())
        throw new Error(`Unsafe template entry: ${path}`);
      if (entry.isDirectory()) visit(absolute);
      else {
        if (!entry.isFile()) throw new Error(`Unexpected template entry: ${path}`);
        found.set(path, {
          content: readFileSync(absolute),
          mode: recordedMode(modes, path, absolute),
        });
      }
    }
  }
  visit(root);
  return new Map([...found].sort(([left], [right]) => left.localeCompare(right)));
}

export function readGitVisibleFiles(root: string): FileMap | undefined {
  if (!existsSync(join(root, '.git'))) return undefined;
  const result = spawnSync(
    'git',
    ['-C', stripWindowsDriveNamespace(root), 'ls-files', '-c', '-o', '--exclude-standard', '-z'],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Unable to list Git-visible repository files: ${result.stderr}`);
  const modes = indexModes(root);
  const paths = result.stdout.split('\0');
  if (paths.pop() !== '') throw new Error('Git returned a malformed file list.');
  const found = new Map<string, FileEntry>();
  for (const path of paths) {
    if (!validPath(path)) throw new Error(`Unsafe repository path: ${path}`);
    const absolute = join(root, path);
    const entry = lstatSync(absolute);
    if (entry.isSymbolicLink() || !entry.isFile())
      throw new Error(`Unexpected repository entry: ${path}`);
    found.set(path, {
      content: readFileSync(absolute),
      mode: recordedMode(modes, path, absolute),
    });
  }
  return new Map([...found].sort(([left], [right]) => left.localeCompare(right)));
}

export function sameEntry(left: FileEntry, right: FileEntry): boolean {
  return left.mode === right.mode && left.content.equals(right.content);
}

export function compareFiles(actual: FileMap, expected: FileMap, label: string): void {
  if (actual.size !== expected.size || [...actual.keys()].some((path) => !expected.has(path)))
    throw new Error(`${label}: complete file sets differ.`);
  for (const [path, entry] of expected) {
    const found = actual.get(path);
    if (!found || !sameEntry(found, entry))
      throw new Error(`${label}: file bytes or mode differ: ${path}`);
  }
}

export function writeFiles(root: string, files: FileMap): void {
  mkdirSync(root, { recursive: true });
  realDirectory(root);
  validateDestination(root, files);
  for (const [path, entry] of files) {
    if (!validPath(path)) throw new Error(`Unsafe output path: ${path}`);
    const absolute = join(root, path);
    const ancestors = path.split('/').slice(0, -1);
    let directory = root;
    for (const name of ancestors) {
      directory = join(directory, name);
      if (existsSync(directory)) realDirectory(directory);
      else mkdirSync(directory);
    }
    if (existsSync(absolute) && !lstatSync(absolute).isFile())
      throw new Error(`Unsafe output file: ${absolute}`);
    if (lstatIfPresent(absolute)?.isSymbolicLink())
      throw new Error(`Output links are not allowed: ${absolute}`);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, entry.content);
    chmodSync(absolute, entry.mode);
  }
}

export function validateDestination(root: string, files: FileMap): void {
  if (lstatIfPresent(root)) realDirectory(root);
  for (const path of files.keys()) {
    if (!validPath(path)) throw new Error(`Unsafe output path: ${path}`);
    let directory = root;
    for (const name of path.split('/').slice(0, -1)) {
      directory = join(directory, name);
      if (lstatIfPresent(directory)) realDirectory(directory);
    }
    const existing = lstatIfPresent(join(root, path));
    if (existing && (!existing.isFile() || existing.isSymbolicLink()))
      throw new Error(`Unsafe output file: ${path}`);
  }
}

export function lstatIfPresent(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}
