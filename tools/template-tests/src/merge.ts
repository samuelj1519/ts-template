import { format, resolveConfig } from 'prettier';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { Preset } from './registry.ts';

const jsonSchema = z.json();
type JsonValue = z.infer<typeof jsonSchema>;
export type JsonObject = Record<string, JsonValue>;
const objectSchema = z.record(z.string(), jsonSchema);

export function parseObject(content: Buffer): JsonObject {
  return objectSchema.parse(JSON.parse(content.toString('utf8')));
}

function isObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function severity(value: JsonValue): JsonValue {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function errorSeverity(value: JsonValue): boolean {
  const level = severity(value);
  return level === 'error' || level === 2;
}

export function canonicalJson(value: JsonValue | undefined): string {
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function mergeArray(base: JsonValue, overlay: JsonValue, path: string): JsonValue | undefined {
  if (!Array.isArray(base) || !Array.isArray(overlay)) return undefined;
  if (path === '.oxlintrc.json/plugins') return [...new Set([...base, ...overlay])];
  if (path === '.oxlintrc.json/overrides') return [...base, ...overlay];
  return undefined;
}

function overriddenRule(
  base: JsonValue,
  overlay: JsonValue,
  path: string,
  preset: Preset,
  used: Set<string>,
): boolean {
  const rule = path.startsWith('.oxlintrc.json/rules/')
    ? path.slice('.oxlintrc.json/rules/'.length)
    : '';
  const declared = preset.ruleOverrides.some((allowed) => allowed === rule);
  if (!declared || !errorSeverity(base) || !errorSeverity(overlay)) return false;
  used.add(rule);
  return true;
}

function mergeValue(
  base: JsonValue,
  overlay: JsonValue,
  path: string,
  preset: Preset,
  used: Set<string>,
): JsonValue {
  if (isObject(base) && isObject(overlay)) {
    const result = new Map(Object.entries(base));
    for (const [key, value] of Object.entries(overlay))
      result.set(
        key,
        result.has(key)
          ? mergeValue(result.get(key) ?? null, value, `${path}/${key}`, preset, used)
          : value,
      );
    return Object.fromEntries(result);
  }
  if (canonicalJson(base) === canonicalJson(overlay)) return base;
  const array = mergeArray(base, overlay, path);
  if (array) return array;
  if (overriddenRule(base, overlay, path, preset, used)) return overlay;
  throw new Error(`Conflicting JSON values require an authorized declaration: ${path}`);
}

export function mergeObjects(
  base: JsonObject,
  overlay: JsonObject,
  filename: string,
  preset: Preset,
): JsonObject {
  const used = new Set<string>();
  const result = objectSchema.parse(mergeValue(base, overlay, filename, preset, used));
  if (filename === '.oxlintrc.json' && preset.ruleOverrides.some((rule) => !used.has(rule)))
    throw new Error(`Unused rule override in preset ${preset.id}.`);
  return result;
}

export async function jsonFile(
  value: JsonObject,
  configurationPath: string,
  filename = 'package.json',
): Promise<Buffer> {
  const configuration = await resolveConfig(configurationPath);
  return Buffer.from(
    await format(JSON.stringify(value), {
      ...configuration,
      filepath: join(dirname(configurationPath), filename),
      endOfLine: 'lf',
    }),
  );
}
