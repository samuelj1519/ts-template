import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseJsonc } from 'jsonc-parser';
import { z } from 'zod';

/**
 * Exact approval scope from the work-group decision recorded on 2026-11-18.
 * The exception record must match these values; nothing else is excepted.
 */
export const APPROVAL = {
  advisoryId: 'GHSA-fc5q-39xc-vjpf',
  package: 'picomatch',
  lockedVersion: '4.0.7',
  scope: 'devOnly',
  approvedBy: 'Nika',
  approvedAt: '2026-11-18T14:39:00+08:00',
  maxWindowMs: 30 * 24 * 60 * 60 * 1000,
  /** SHA-256 over the canonicalized approved path set; binds record.paths to this code. */
  pathsDigest: '0a5d0990e21d9f51da8b4d8cbd14009a94279bf1ac1ee41def3cad492e573115',
} as const;

const AUDIT_ARGS = ['audit', '--audit-level=low', '--json'] as const;
const GHSA_PATTERN = /GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/u;

const recordSchema = z.strictObject({
  advisoryId: z.string().min(1),
  package: z.string().min(1),
  lockedVersion: z.string().min(1),
  scope: z.string().min(1),
  paths: z.array(z.array(z.string().min(1)).min(2)).min(1),
  reason: z.string().min(1),
  approvedBy: z.string().min(1),
  approvedAt: z.string().min(1),
  expiresAt: z.string().min(1),
  evidence: z.array(z.string().min(1)).min(1),
});

export type ExceptionRecord = z.infer<typeof recordSchema>;

const viaAdvisorySchema = z.object({
  source: z.number(),
  name: z.string().min(1),
  dependency: z.string().min(1),
  title: z.string().min(1),
  url: z.string().min(1),
  severity: z.string().min(1),
  range: z.string().min(1),
});

export type ViaAdvisory = z.infer<typeof viaAdvisorySchema>;

const viaItemSchema = z.union([z.string().min(1), viaAdvisorySchema]);

const vulnerabilitySchema = z.object({
  name: z.string().min(1),
  severity: z.string().min(1),
  isDirect: z.boolean(),
  via: z.array(viaItemSchema),
  effects: z.array(z.string()),
  range: z.string(),
  nodes: z.array(z.string()),
});

const auditSchema = z.object({
  auditReportVersion: z.literal(2),
  vulnerabilities: z.record(z.string(), vulnerabilitySchema),
  metadata: z.object({
    vulnerabilities: z.object({
      info: z.number(),
      low: z.number(),
      moderate: z.number(),
      high: z.number(),
      critical: z.number(),
      total: z.number(),
    }),
  }),
});

type AuditReport = z.infer<typeof auditSchema>;

/**
 * `bun audit --json` (bun 1.3.11) emits a direct map of package name to
 * advisory objects (verified against real output in
 * artifacts/security-exception/logs/coordinator-bun-*.txt), without the npm
 * audit-report envelope. Strictly validated; anything else fails closed.
 */
const bunAdvisorySchema = z.strictObject({
  id: z.number(),
  url: z.string().min(1),
  title: z.string().min(1),
  severity: z.string().min(1),
  vulnerable_versions: z.string().min(1),
  cwe: z.array(z.string().min(1)),
  cvss: z.strictObject({ score: z.number(), vectorString: z.string().min(1) }),
});

const bunAuditSchema = z.record(z.string(), z.array(bunAdvisorySchema).min(1));

const dependencyFieldsSchema = z.record(z.string(), z.string());

const npmEntrySchema = z
  .object({
    version: z.string().optional(),
    dev: z.boolean().optional(),
    dependencies: dependencyFieldsSchema.optional(),
    optionalDependencies: dependencyFieldsSchema.optional(),
    peerDependencies: dependencyFieldsSchema.optional(),
    devDependencies: dependencyFieldsSchema.optional(),
  })
  .passthrough();

const npmLockSchema = z.object({
  lockfileVersion: z.literal(3),
  packages: z.record(z.string(), npmEntrySchema),
});

const bunInfoSchema = z
  .object({
    dependencies: dependencyFieldsSchema.optional(),
    optionalDependencies: dependencyFieldsSchema.optional(),
    peerDependencies: dependencyFieldsSchema.optional(),
    devDependencies: dependencyFieldsSchema.optional(),
  })
  .passthrough();

const bunLockSchema = z.object({
  lockfileVersion: z.literal(1),
  workspaces: z
    .object({
      '': z
        .object({
          dependencies: dependencyFieldsSchema.optional(),
          devDependencies: dependencyFieldsSchema.optional(),
        })
        .passthrough(),
    })
    .passthrough(),
  packages: z.record(z.string(), z.array(z.unknown()).min(3)),
});

export type AuditCommandResult = {
  readonly status: number | null;
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: string | undefined;
};

export type EvaluateInput = {
  readonly recordText: string;
  readonly audit: AuditCommandResult;
  readonly family: 'npm' | 'bun';
  readonly lockText: string | undefined;
  readonly now: Date;
};

export type EvaluateResult = {
  readonly ok: boolean;
  readonly passedWithException: boolean;
  readonly failures: readonly string[];
  readonly warning: string | undefined;
};

type LockEntryInfo = {
  readonly version: string | undefined;
  readonly dev: boolean | undefined;
  readonly dependencies: readonly string[];
};

type LockGraph = {
  readonly entries: ReadonlyMap<string, readonly LockEntryInfo[]>;
  readonly edges: ReadonlyMap<string, ReadonlySet<string>>;
  readonly roots: ReadonlySet<string>;
  readonly prodRoots: ReadonlySet<string>;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ghsaOf(url: string): string | undefined {
  return GHSA_PATTERN.exec(url)?.[0];
}

function zodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function parseJsonText(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

/**
 * Parse the exception record and bind it to the exact approved scope.
 * Any mismatch is an invalid record and must fail closed.
 */
export function parseRecord(text: string): ExceptionRecord {
  const parsed = recordSchema.safeParse(parseJsonText(text, 'audit-exception.json'));
  if (!parsed.success) {
    throw new Error(`audit-exception.json is invalid: ${zodIssues(parsed.error)}`);
  }
  const record = parsed.data;
  assert(
    record.advisoryId === APPROVAL.advisoryId,
    'record advisoryId is not the approved advisory',
  );
  assert(record.package === APPROVAL.package, 'record package is not the approved package');
  assert(
    record.lockedVersion === APPROVAL.lockedVersion,
    'record lockedVersion is not the approved version',
  );
  assert(record.scope === APPROVAL.scope, 'record scope is not the approved scope');
  assert(
    record.approvedBy === APPROVAL.approvedBy,
    'record approvedBy is not the approved approver',
  );
  assert(
    record.approvedAt === APPROVAL.approvedAt,
    'record approvedAt is not the approved approval time',
  );
  const approvedAtMs = Date.parse(APPROVAL.approvedAt);
  const expiresAtMs = Date.parse(record.expiresAt);
  assert(!Number.isNaN(expiresAtMs), 'record expiresAt is not a parseable timestamp');
  assert(expiresAtMs > approvedAtMs, 'record expiresAt must be after approvedAt');
  assert(
    expiresAtMs - approvedAtMs <= APPROVAL.maxWindowMs,
    'record expiry exceeds the approved 30-day window',
  );
  const chains = new Set<string>();
  for (const chain of record.paths) {
    assert(
      chain[chain.length - 1] === record.package,
      'every approved path must end at the package',
    );
    assert(new Set(chain).size === chain.length, 'an approved path repeats a package name');
    assert(!chains.has(chain.join('>')), 'approved paths must be unique');
    chains.add(chain.join('>'));
  }
  assert(
    canonicalPathsDigest(record.paths) === APPROVAL.pathsDigest,
    'record paths do not match the approved path set',
  );
  return record;
}

/** Order-insensitive SHA-256 fingerprint of the approved concrete dependency paths. */
function canonicalPathsDigest(paths: readonly (readonly string[])[]): string {
  const canonical = [...paths].sort((a, b) => a.join('>').localeCompare(b.join('>')));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/** Fail closed when the clock is outside the approved validity window. */
export function recordTimeFailure(record: ExceptionRecord, now: Date): string | undefined {
  const nowMs = now.getTime();
  if (Number.isNaN(nowMs)) return 'evaluation clock is invalid';
  const approvedAtMs = Date.parse(APPROVAL.approvedAt);
  const expiresAtMs = Date.parse(record.expiresAt);
  if (nowMs < approvedAtMs) return `exception is not effective before ${APPROVAL.approvedAt}`;
  if (nowMs >= expiresAtMs) return `exception expired at ${record.expiresAt}`;
  return undefined;
}

type ResolvedAdvisories = {
  readonly advisories: readonly ViaAdvisory[];
  readonly unresolved: readonly string[];
};

/**
 * Resolve every vulnerability entry down to its underlying advisory sources,
 * including parent-tool aggregate entries whose `via` items are package-name
 * strings. Aggregate entries must never suppress other underlying sources.
 */
export function resolveAdvisories(report: AuditReport): ResolvedAdvisories {
  const advisories: ViaAdvisory[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();
  const visit = (name: string, visited: ReadonlySet<string>): void => {
    if (visited.has(name)) return;
    const entry = report.vulnerabilities[name];
    if (entry === undefined || entry.via.length === 0) {
      unresolved.push(name);
      return;
    }
    const nextVisited = new Set([...visited, name]);
    for (const item of entry.via) {
      if (typeof item === 'string') {
        visit(item, nextVisited);
        continue;
      }
      const key = `${String(item.source)}|${item.url}|${item.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      advisories.push(item);
    }
  };
  for (const name of Object.keys(report.vulnerabilities)) visit(name, new Set());
  return { advisories, unresolved };
}

function collectDependencies(entry: {
  dependencies?: Record<string, string> | undefined;
  optionalDependencies?: Record<string, string> | undefined;
  peerDependencies?: Record<string, string> | undefined;
}): string[] {
  return [
    ...Object.keys(entry.dependencies ?? {}),
    ...Object.keys(entry.optionalDependencies ?? {}),
    ...Object.keys(entry.peerDependencies ?? {}),
  ];
}

function pushEntry(entries: Map<string, LockEntryInfo[]>, name: string, info: LockEntryInfo): void {
  const infos = entries.get(name) ?? [];
  infos.push(info);
  entries.set(name, infos);
}

function buildGraph(
  entries: Map<string, LockEntryInfo[]>,
  roots: ReadonlySet<string>,
  prodRoots: ReadonlySet<string>,
): LockGraph {
  const edges = new Map<string, Set<string>>();
  for (const [name, infos] of entries) {
    const out = edges.get(name) ?? new Set<string>();
    for (const info of infos) for (const dep of info.dependencies) out.add(dep);
    edges.set(name, out);
  }
  return { entries, edges, roots, prodRoots };
}

function workspaceRoots(
  dependencies: Record<string, string> | undefined,
  devDependencies: Record<string, string> | undefined,
): Set<string> {
  return new Set([...Object.keys(dependencies ?? {}), ...Object.keys(devDependencies ?? {})]);
}

function npmNameFromPath(path: string): string {
  const marker = 'node_modules/';
  const at = path.lastIndexOf(marker);
  return at === -1 ? '' : path.slice(at + marker.length);
}

function parseNpmLockData(text: string): z.infer<typeof npmLockSchema> {
  const parsed = npmLockSchema.safeParse(parseJsonText(text, 'package-lock.json'));
  if (!parsed.success) {
    throw new Error(`unsupported package-lock.json schema: ${zodIssues(parsed.error)}`);
  }
  return parsed.data;
}

function npmLockGraph(text: string): LockGraph {
  const data = parseNpmLockData(text);
  const entries = new Map<string, LockEntryInfo[]>();
  for (const [path, entry] of Object.entries(data.packages)) {
    if (path === '') continue;
    const name = npmNameFromPath(path);
    if (name === '') throw new Error(`unsupported package-lock.json entry path: ${path}`);
    pushEntry(entries, name, {
      version: entry.version,
      dev: entry.dev,
      dependencies: collectDependencies(entry),
    });
  }
  const root = data.packages[''];
  if (root === undefined) throw new Error('package-lock.json has no root workspace entry');
  return buildGraph(
    entries,
    workspaceRoots(root.dependencies, root.devDependencies),
    new Set(Object.keys(root.dependencies ?? {})),
  );
}

function splitBunKey(key: string): { readonly name: string; readonly version: string | undefined } {
  const at = key.startsWith('@') ? key.indexOf('@', 1) : key.indexOf('@');
  return at > 0
    ? { name: key.slice(0, at), version: key.slice(at + 1) }
    : { name: key, version: undefined };
}

function bunResolutionVersion(resolution: string): string | undefined {
  const at = resolution.startsWith('@') ? resolution.indexOf('@', 1) : resolution.indexOf('@');
  return at > 0 ? resolution.slice(at + 1) : undefined;
}

function bunEntry(key: string, tuple: readonly unknown[]): { name: string; info: LockEntryInfo } {
  const { name, version } = splitBunKey(key);
  const resolution = tuple[0];
  if (typeof resolution !== 'string') {
    throw new Error(`unsupported bun.lock entry resolution for ${key}`);
  }
  const infoParsed = bunInfoSchema.safeParse(tuple[2] ?? {});
  if (!infoParsed.success) {
    throw new Error(
      `unsupported bun.lock entry metadata for ${key}: ${zodIssues(infoParsed.error)}`,
    );
  }
  return {
    name,
    info: {
      version: version ?? bunResolutionVersion(resolution),
      dev: undefined,
      dependencies: collectDependencies(infoParsed.data),
    },
  };
}

function parseBunLockData(text: string): z.infer<typeof bunLockSchema> {
  let raw: unknown;
  try {
    raw = parseJsonc(text, [], { allowTrailingComma: true }) as unknown;
  } catch {
    throw new Error('bun.lock is not parseable JSONC');
  }
  const parsed = bunLockSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`unsupported bun.lock schema: ${zodIssues(parsed.error)}`);
  }
  return parsed.data;
}

function bunLockGraph(text: string): LockGraph {
  const data = parseBunLockData(text);
  const entries = new Map<string, LockEntryInfo[]>();
  for (const [key, tuple] of Object.entries(data.packages)) {
    const { name, info } = bunEntry(key, tuple);
    pushEntry(entries, name, info);
  }
  const workspace = data.workspaces[''];
  return buildGraph(
    entries,
    workspaceRoots(workspace.dependencies, workspace.devDependencies),
    new Set(Object.keys(workspace.dependencies ?? {})),
  );
}

function lockGraph(family: 'npm' | 'bun', text: string): LockGraph {
  return family === 'npm' ? npmLockGraph(text) : bunLockGraph(text);
}

function reachableFromProd(graph: LockGraph, target: string): boolean {
  const seen = new Set<string>();
  const queue = [...graph.prodRoots];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    for (const dep of graph.edges.get(current) ?? []) {
      if (graph.entries.has(dep)) queue.push(dep);
    }
  }
  return seen.has(target);
}

/** Enumerate every concrete dependency chain from a root dependency to `target`. */
function chainsTo(graph: LockGraph, target: string): string[][] {
  const results: string[][] = [];
  const walk = (current: string, chain: string[], seen: ReadonlySet<string>): void => {
    for (const dep of graph.edges.get(current) ?? []) {
      if (!graph.entries.has(dep)) continue;
      const next = [...chain, dep];
      if (dep === target) {
        results.push(next);
        continue;
      }
      if (seen.has(dep)) continue;
      walk(dep, next, new Set([...seen, dep]));
    }
  };
  for (const root of graph.roots) {
    if (!graph.entries.has(root)) continue;
    if (root === target) {
      results.push([root]);
      continue;
    }
    walk(root, [root], new Set([root]));
  }
  return results;
}

function buildWarning(record: ExceptionRecord, applied: boolean): string {
  const binding =
    `${record.advisoryId} on ${record.package} ${record.lockedVersion} (scope ${record.scope}) ` +
    `until ${record.expiresAt}, approved by ${record.approvedBy} at ${record.approvedAt}`;
  return applied
    ? `WARNING security exception applied: audit-exception.json excepts ${binding}.`
    : `NOTICE security exception record active but not applied this run: audit-exception.json covers ${binding}.`;
}

function checkAffectedEntries(
  affected: readonly LockEntryInfo[],
  family: 'npm' | 'bun',
  failures: string[],
): void {
  for (const entry of affected) {
    if (entry.version !== APPROVAL.lockedVersion) {
      failures.push(
        `locked ${APPROVAL.package} version ${String(entry.version)} is outside the approved version ${APPROVAL.lockedVersion}`,
      );
    }
  }
  if (family !== 'npm') return;
  for (const entry of affected) {
    if (entry.dev !== true) {
      failures.push(`${APPROVAL.package} entry is not marked dev-only in the npm lockfile`);
    }
  }
}

function checkChains(graph: LockGraph, record: ExceptionRecord, failures: string[]): void {
  const chains = chainsTo(graph, APPROVAL.package);
  if (chains.length === 0) {
    failures.push('no dependency chain to the vulnerable package was found in the lockfile');
    return;
  }
  const approved = new Set(record.paths.map((chain) => chain.join('>')));
  for (const chain of chains) {
    if (!approved.has(chain.join('>'))) {
      failures.push(`unassessed dependency path: ${chain.join(' > ')}`);
    }
  }
}

function evaluateLockScope(
  input: EvaluateInput,
  record: ExceptionRecord,
  failures: string[],
): void {
  if (input.lockText === undefined) {
    failures.push('lockfile is missing; scope and paths cannot be proven');
    return;
  }
  let graph: LockGraph;
  try {
    graph = lockGraph(input.family, input.lockText);
  } catch (error) {
    failures.push(`lock scope proof failed: ${messageOf(error)}`);
    return;
  }
  const affected = graph.entries.get(APPROVAL.package) ?? [];
  if (affected.length === 0) {
    failures.push('audit reports the approved advisory but the lockfile has no such package entry');
    return;
  }
  checkAffectedEntries(affected, input.family, failures);
  if (reachableFromProd(graph, APPROVAL.package)) {
    failures.push(`${APPROVAL.package} is reachable from production dependencies`);
  }
  checkChains(graph, record, failures);
}

type ParsedAdvisories = {
  readonly advisories: readonly ViaAdvisory[];
  readonly failures: readonly string[];
};

function collectNpmAdvisories(report: AuditReport): ParsedAdvisories {
  const { advisories, unresolved } = resolveAdvisories(report);
  const failures = unresolved.map(
    (name) => `audit output references a missing vulnerability entry: ${name}`,
  );
  if (unresolved.length > 0) return { advisories, failures };
  if (Object.keys(report.vulnerabilities).length > 0 && advisories.length === 0) {
    return {
      advisories,
      failures: [
        ...failures,
        'audit output has vulnerability entries without resolvable advisories',
      ],
    };
  }
  return { advisories, failures };
}

function parseNpmOutput(raw: unknown): ParsedAdvisories | undefined {
  const parsed = auditSchema.safeParse(raw);
  return parsed.success ? collectNpmAdvisories(parsed.data) : undefined;
}

function parseBunOutput(raw: unknown): ParsedAdvisories | undefined {
  const parsed = bunAuditSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const advisories: ViaAdvisory[] = [];
  for (const [name, entries] of Object.entries(parsed.data)) {
    for (const entry of entries) {
      advisories.push({
        source: entry.id,
        name,
        dependency: name,
        title: entry.title,
        url: entry.url,
        severity: entry.severity,
        range: entry.vulnerable_versions,
      });
    }
  }
  return { advisories, failures: [] };
}

type AuditOutputEvaluation = {
  readonly advisories: readonly ViaAdvisory[] | undefined;
  readonly failures: readonly string[];
};

function readAuditJson(stdout: string): {
  readonly raw: unknown;
  readonly failure: string | undefined;
} {
  try {
    return { raw: JSON.parse(stdout) as unknown, failure: undefined };
  } catch {
    return { raw: undefined, failure: 'audit output is not valid JSON' };
  }
}

function parseAuditPayload(raw: unknown): ParsedAdvisories | undefined {
  const npmShaped =
    typeof raw === 'object' &&
    raw !== null &&
    ('auditReportVersion' in raw || 'vulnerabilities' in raw);
  return npmShaped ? parseNpmOutput(raw) : parseBunOutput(raw);
}

function evaluateAuditOutput(audit: AuditCommandResult): AuditOutputEvaluation {
  if (audit.error !== undefined) {
    return { advisories: undefined, failures: [`audit command failed to run: ${audit.error}`] };
  }
  if (audit.status !== 0 && audit.status !== 1) {
    return {
      advisories: undefined,
      failures: [`audit command failed with exit ${String(audit.status)}`],
    };
  }
  const parsedJson = readAuditJson(audit.stdout);
  if (parsedJson.failure !== undefined) {
    return { advisories: undefined, failures: [parsedJson.failure] };
  }
  const raw = parsedJson.raw;
  if (typeof raw === 'object' && raw !== null && 'error' in raw) {
    return { advisories: undefined, failures: ['audit returned an infrastructure error payload'] };
  }
  const parsed = parseAuditPayload(raw);
  if (parsed === undefined) {
    return { advisories: undefined, failures: ['audit output has an unknown or malformed schema'] };
  }
  return { advisories: parsed.advisories, failures: parsed.failures };
}

function isApprovedAdvisory(advisory: ViaAdvisory): boolean {
  return (
    ghsaOf(advisory.url) === APPROVAL.advisoryId &&
    advisory.name === APPROVAL.package &&
    advisory.dependency === APPROVAL.package
  );
}

/**
 * Evaluate one audit run against the exception record and the lock state.
 * Every unproven or out-of-scope condition fails closed.
 */
export function evaluateException(input: EvaluateInput): EvaluateResult {
  let record: ExceptionRecord;
  try {
    record = parseRecord(input.recordText);
  } catch (error) {
    return {
      ok: false,
      passedWithException: false,
      failures: [messageOf(error)],
      warning: undefined,
    };
  }
  const failures: string[] = [];
  const timeFailure = recordTimeFailure(record, input.now);
  if (timeFailure !== undefined) failures.push(timeFailure);
  const output = evaluateAuditOutput(input.audit);
  failures.push(...output.failures);
  let exceptionUsed = false;
  if (output.advisories !== undefined && output.failures.length === 0) {
    exceptionUsed = output.advisories.length > 0;
    const outOfScope = output.advisories.filter((advisory) => !isApprovedAdvisory(advisory));
    for (const advisory of outOfScope) {
      failures.push(
        `advisory outside the approved scope: ${advisory.name}/${advisory.dependency} ${advisory.url}`,
      );
    }
    if (outOfScope.length === 0 && output.advisories.length > 0) {
      evaluateLockScope(input, record, failures);
    }
  }
  const ok = failures.length === 0;
  return {
    ok,
    passedWithException: ok && exceptionUsed,
    failures,
    warning: ok ? buildWarning(record, exceptionUsed) : undefined,
  };
}

export type CommandRunner = (family: 'npm' | 'bun', projectRoot: string) => AuditCommandResult;

function npmAuditSpawn(projectRoot: string): SpawnSyncReturns<string> {
  const options = {
    cwd: projectRoot,
    encoding: 'utf8' as const,
    timeout: 300_000,
    maxBuffer: 32 * 1024 * 1024,
  };
  const cli = process.env['npm_execpath'];
  return cli !== undefined && existsSync(cli)
    ? spawnSync(process.execPath, [cli, ...AUDIT_ARGS], options)
    : spawnSync('npm', [...AUDIT_ARGS], options);
}

function defaultCommandRunner(family: 'npm' | 'bun', projectRoot: string): AuditCommandResult {
  const result =
    family === 'npm'
      ? npmAuditSpawn(projectRoot)
      : spawnSync('bun', [...AUDIT_ARGS], {
          cwd: projectRoot,
          encoding: 'utf8',
          timeout: 300_000,
          maxBuffer: 32 * 1024 * 1024,
        });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error === undefined ? undefined : String(result.error),
  };
}

function detectFamily(projectRoot: string): {
  readonly family: 'npm' | 'bun' | undefined;
  readonly failures: readonly string[];
} {
  try {
    const manifestText = readFileSync(join(projectRoot, 'package.json'), 'utf8');
    const manifest = JSON.parse(manifestText) as { packageManager?: unknown };
    const packageManager = manifest.packageManager;
    if (packageManager === 'npm@12.2.2') return { family: 'npm', failures: [] };
    if (packageManager === 'bun@1.3.11') return { family: 'bun', failures: [] };
    return {
      family: undefined,
      failures: [`unsupported packageManager field: ${String(packageManager)}`],
    };
  } catch (error) {
    return { family: undefined, failures: [`package manifest is unreadable: ${messageOf(error)}`] };
  }
}

function readOptionalText(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

function preserveRawOutput(projectRoot: string, audit: AuditCommandResult): string | undefined {
  try {
    const artifactDir = join(projectRoot, 'artifacts', 'security-exception');
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(join(artifactDir, 'audit-stdout.txt'), audit.stdout);
    return undefined;
  } catch (error) {
    return `raw audit output could not be preserved: ${messageOf(error)}`;
  }
}

function preserveRunMetadata(input: {
  readonly projectRoot: string;
  readonly audit: AuditCommandResult;
  readonly family: 'npm' | 'bun' | undefined;
  readonly now: Date;
  readonly result: EvaluateResult;
  readonly failures: readonly string[];
}): string | undefined {
  try {
    const artifactDir = join(input.projectRoot, 'artifacts', 'security-exception');
    writeFileSync(
      join(artifactDir, 'audit-run.json'),
      JSON.stringify(
        {
          command: `${input.family ?? 'unknown'} ${AUDIT_ARGS.join(' ')}`,
          family: input.family ?? 'unknown',
          exit: input.audit.status,
          signal: input.audit.signal,
          error: input.audit.error,
          stderr: input.audit.stderr,
          evaluatedAt: input.now.toISOString(),
          outcome: input.failures.length === 0 ? 'pass' : 'fail',
          passedWithException: input.result.passedWithException,
          failures: input.failures,
          warning: input.result.warning,
        },
        null,
        2,
      ) + '\n',
    );
    return undefined;
  } catch (error) {
    return `audit run metadata could not be preserved: ${messageOf(error)}`;
  }
}

function composeLines(
  result: EvaluateResult,
  failures: readonly string[],
): { readonly code: 0 | 1; readonly lines: readonly string[] } {
  if (failures.length > 0) {
    return { code: 1, lines: failures.map((line) => `check:security FAIL: ${line}`) };
  }
  return {
    code: 0,
    lines: [
      result.passedWithException
        ? 'check:security PASS: approved advisory present under the time-boxed exception.'
        : 'check:security PASS: no advisories reported.',
      ...(result.warning === undefined ? [] : [result.warning]),
    ],
  };
}

export type GuardRun = {
  readonly code: 0 | 1;
  readonly lines: readonly string[];
};

type GuardInputs = {
  readonly family: 'npm' | 'bun' | undefined;
  readonly recordText: string;
  readonly lockText: string | undefined;
  readonly failures: readonly string[];
};

function loadGuardInputs(projectRoot: string): GuardInputs {
  const detected = detectFamily(projectRoot);
  const recordText =
    readOptionalText(fileURLToPath(new URL('./audit-exception.json', import.meta.url))) ?? '';
  const recordFailures =
    recordText === '' ? ['exception record tools/checks/audit-exception.json is missing'] : [];
  const lockName = detected.family === 'npm' ? 'package-lock.json' : 'bun.lock';
  const lockText =
    detected.family === undefined ? undefined : readOptionalText(join(projectRoot, lockName));
  return {
    family: detected.family,
    recordText,
    lockText,
    failures: [...detected.failures, ...recordFailures],
  };
}

function executeAudit(
  family: 'npm' | 'bun' | undefined,
  projectRoot: string,
  runner: CommandRunner | undefined,
): { readonly audit: AuditCommandResult | undefined; readonly failure: string | undefined } {
  if (family === undefined) return { audit: undefined, failure: undefined };
  try {
    return { audit: (runner ?? defaultCommandRunner)(family, projectRoot), failure: undefined };
  } catch (error) {
    return { audit: undefined, failure: `audit command failed to run: ${messageOf(error)}` };
  }
}

/**
 * Run the audit command, preserve its raw output under artifacts/, then apply
 * the fail-closed evaluation. The audit command and threshold are unchanged:
 * `npm audit --audit-level=low --json` / `bun audit --audit-level=low --json`.
 */
export function runAuditGuard(options: {
  readonly projectRoot: string;
  readonly now: Date;
  readonly runCommand?: CommandRunner;
}): GuardRun {
  const inputs = loadGuardInputs(options.projectRoot);
  const failures = [...inputs.failures];
  const executed = executeAudit(inputs.family, options.projectRoot, options.runCommand);
  if (executed.failure !== undefined) failures.push(executed.failure);
  const audit = executed.audit;
  if (audit !== undefined) {
    const rawFailure = preserveRawOutput(options.projectRoot, audit);
    if (rawFailure !== undefined) failures.push(rawFailure);
  }
  const result =
    audit === undefined
      ? { ok: false, passedWithException: false, failures: [], warning: undefined }
      : evaluateException({
          recordText: inputs.recordText,
          audit,
          family: inputs.family ?? 'npm',
          lockText: inputs.lockText,
          now: options.now,
        });
  const allFailures = [...failures, ...result.failures];
  if (audit !== undefined) {
    const metadataFailure = preserveRunMetadata({
      projectRoot: options.projectRoot,
      audit,
      family: inputs.family,
      now: options.now,
      result,
      failures: allFailures,
    });
    if (metadataFailure !== undefined) allFailures.push(metadataFailure);
  }
  return composeLines(result, allFailures);
}

if (import.meta.main) {
  const outcome = runAuditGuard({ projectRoot: process.cwd(), now: new Date() });
  for (const line of outcome.lines) process.stdout.write(`${line}\n`);
  process.exitCode = outcome.code;
}
