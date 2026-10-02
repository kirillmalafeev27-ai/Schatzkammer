// Переменные из .env.local и .env дополняют окружение процесса, но не перекрывают его:
// секреты хостинга важнее файлов.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

export function loadEnvFiles(root: string, files = ['.env.local', '.env']): void {
  for (const name of files) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(path, 'utf8')))) {
      if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
    }
  }
}
