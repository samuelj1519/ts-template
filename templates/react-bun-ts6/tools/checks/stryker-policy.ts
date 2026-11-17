import { readFileSync } from 'node:fs';

export const STRYKER_TSCONFIG_FAILURE = `Stryker 10.1.1 的 tsconfig 预处理调用 TS 6 编译器 API，TS 7 已删除这些接口。stryker.config.json 必须显式设置 "tsconfigFile": ""，再运行所选管理器的 run check。不要只删字段。上游修复：https://github.com/stryker-mutator/stryker-js/pull/6231 。`;

export function validateStrykerTsconfigField(
  configPath: string,
  read: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): void {
  let raw: string;
  try {
    raw = read(configPath);
  } catch {
    throw new Error(`${STRYKER_TSCONFIG_FAILURE}\n(${configPath} is missing.)`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${STRYKER_TSCONFIG_FAILURE}\n(${configPath} is not valid JSON.)`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${STRYKER_TSCONFIG_FAILURE}\n(Expected a JSON object root.)`);
  }
  if (!Object.prototype.hasOwnProperty.call(parsed, 'tsconfigFile')) {
    throw new Error(`${STRYKER_TSCONFIG_FAILURE}\n(tsconfigFile is missing.)`);
  }
  const value = (parsed as Record<string, unknown>)['tsconfigFile'];
  if (value !== '') {
    throw new Error(
      `${STRYKER_TSCONFIG_FAILURE}\n(tsconfigFile must be exactly "", got ${JSON.stringify(value)}.)`,
    );
  }
}
