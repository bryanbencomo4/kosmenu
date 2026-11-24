import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { WaMasterMemory } from './types';
import type { WaMasterMemoryStore } from './memory-store';

/**
 * Durable local/Preview-file memory — survives process restart without prod DB.
 */
export function createFileWaMasterMemoryStore(dataDir: string): WaMasterMemoryStore {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const filePath = join(dataDir, 'wa-master-memory.json');

  const readAll = (): Record<string, WaMasterMemory> => {
    if (!existsSync(filePath)) return {};
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
      if (!raw || typeof raw !== 'object') return {};
      return raw as Record<string, WaMasterMemory>;
    } catch {
      return {};
    }
  };

  const writeAll = (all: Record<string, WaMasterMemory>) => {
    const tmp = `${filePath}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(all), 'utf8');
    renameSync(tmp, filePath);
  };

  return {
    async get(fromDigits) {
      return readAll()[fromDigits] ?? null;
    },
    async save(fromDigits, memory) {
      const all = readAll();
      all[fromDigits] = memory;
      writeAll(all);
    },
    async delete(fromDigits) {
      const all = readAll();
      delete all[fromDigits];
      writeAll(all);
    },
  };
}
