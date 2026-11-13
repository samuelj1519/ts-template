import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { parseSync } from '@swc/core';
import { z } from 'zod';
import { sourceExtensions } from '../../quality.config.ts';

export function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Source symlinks are not allowed: ${path}`);
    if (entry.isDirectory()) return sourceFiles(path);
    if (extname(path) === '.vue')
      throw new Error(
        'This preset checks authored TypeScript modules. Vue SFC sources need a separately verified type-checking toolchain.',
      );
    return sourceExtensions.includes(extname(path).slice(1)) ? [path] : [];
  });
}

const dynamicImport = z.object({
  type: z.literal('CallExpression'),
  callee: z.object({ type: z.literal('Import') }),
  arguments: z.array(z.object({ expression: z.object({ type: z.string() }) })),
});

export function validateSource(source: string, filename: string): void {
  const tree = parseSync(source, { syntax: 'typescript', tsx: /\.[jt]sx$/u.test(filename) });
  if (
    basename(filename) === 'index.ts' &&
    tree.body.some(
      (node) => !['ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type),
    )
  ) {
    throw new Error(
      'Keep index.ts a re-export-only public entry; put executable code in measured modules.',
    );
  }
  checkModuleSyntax(tree);
}

function checkModuleSyntax(node: unknown): void {
  if (node === null || typeof node !== 'object') return;
  if ('type' in node && node.type === 'TsImportType') {
    throw new Error('Use import type declarations so dependency checks can resolve the module.');
  }
  const candidate = dynamicImport.safeParse(node);
  if (candidate.success && candidate.data.arguments[0]?.expression.type !== 'StringLiteral') {
    throw new Error('Use a literal module path so architecture checks can resolve the import.');
  }
  for (const value of Object.values(node)) checkModuleSyntax(value);
}

export function checkSources(root: string): string[] {
  const files = sourceFiles(join(root, 'src'));
  if (files.length === 0) throw new Error('Architecture checks require actual TypeScript source.');
  for (const file of files) validateSource(readFileSync(file, 'utf8'), file);
  return files;
}
