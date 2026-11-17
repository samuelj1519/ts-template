import { z } from 'zod';

const stringLiteral = z.object({ type: z.literal('StringLiteral'), value: z.string() });

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function literalModule(value: unknown): string | undefined {
  const parsed = stringLiteral.safeParse(value);
  return parsed.success ? parsed.data.value : undefined;
}

function bannedModule(moduleId: string | undefined): boolean {
  return moduleId === 'bun' || moduleId === '@types/bun' || moduleId?.startsWith('bun:') === true;
}

function rejectBun(filename: string, reason: 'APIs' | 'imports' | 'type imports'): never {
  throw new Error(`Bun runtime ${reason} are not allowed in template source (${filename}).`);
}

function checkImportDeclaration(record: Record<string, unknown>, filename: string): void {
  if (record['type'] !== 'ImportDeclaration' || !isRecord(record['source'])) return;
  if (bannedModule(literalModule(record['source']))) rejectBun(filename, 'imports');
}

function checkDynamicImport(record: Record<string, unknown>, filename: string): void {
  const callee = record['callee'];
  if (record['type'] !== 'CallExpression' || !isRecord(callee) || callee['type'] !== 'Import') {
    return;
  }
  const argumentsList: unknown = record['arguments'];
  const argument: unknown = Array.isArray(argumentsList) ? argumentsList[0] : undefined;
  const moduleId =
    isRecord(argument) && isRecord(argument['expression'])
      ? literalModule(argument['expression'])
      : undefined;
  if (bannedModule(moduleId)) rejectBun(filename, 'imports');
}

function checkTsImportType(record: Record<string, unknown>, filename: string): void {
  if (record['type'] !== 'TsImportType') return;
  const argument = record['argument'];
  const moduleId =
    isRecord(argument) && isRecord(argument['literal'])
      ? literalModule(argument['literal'])
      : isRecord(argument)
        ? literalModule(argument)
        : undefined;
  if (bannedModule(moduleId)) rejectBun(filename, 'type imports');
}

function checkBunMemberAccess(record: Record<string, unknown>, filename: string): void {
  if (record['type'] !== 'MemberExpression') return;
  const object = record['object'];
  if (isRecord(object) && object['type'] === 'Identifier' && object['value'] === 'Bun') {
    rejectBun(filename, 'APIs');
  }
}

function checkBypassServeAccess(record: Record<string, unknown>, filename: string): void {
  if (record['type'] !== 'MemberExpression' || !record['computed']) return;
  const property = record['property'];
  const object = record['object'];
  if (
    !isRecord(property) ||
    property['type'] !== 'StringLiteral' ||
    property['value'] !== 'serve' ||
    !isRecord(object)
  ) {
    return;
  }
  if (object['type'] === 'MemberExpression' || object['type'] === 'CallExpression') {
    rejectBun(filename, 'APIs');
  }
}

function checkMemberExpression(record: Record<string, unknown>, filename: string): void {
  checkBunMemberAccess(record, filename);
  checkBypassServeAccess(record, filename);
}

function checkIdentifier(record: Record<string, unknown>, filename: string): void {
  if (record['type'] === 'Identifier' && record['value'] === 'Bun') rejectBun(filename, 'APIs');
}

function checkBunAtNode(record: Record<string, unknown>, filename: string): void {
  checkIdentifier(record, filename);
  checkImportDeclaration(record, filename);
  checkDynamicImport(record, filename);
  checkTsImportType(record, filename);
  checkMemberExpression(record, filename);
}

function walk(node: unknown, filename: string): void {
  if (!isRecord(node) && !Array.isArray(node)) return;
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, filename));
    return;
  }
  checkBunAtNode(node, filename);
  for (const value of Object.values(node)) walk(value, filename);
}

export function validateBunPolicy(tree: unknown, filename: string): void {
  walk(tree, filename);
}
