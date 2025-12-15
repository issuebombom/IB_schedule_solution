import fs from 'fs/promises';
import path from 'path';
import { ENV } from '../../../env';
import { ParsedWingsSchedules } from '../types/schedules.type';
import { ParsedGoogleCalendar } from '../types/calendar.type';

// Map 데이터 -> JSON
export const saveCache = async (
  cacheMap: ParsedWingsSchedules | ParsedGoogleCalendar,
  fileName: string,
) => {
  const CACHE_PATH = path.join(ENV.CACHE_DIR, fileName);
  const obj = Object.fromEntries(cacheMap);
  await fs.writeFile(CACHE_PATH, JSON.stringify(obj));
};

// JSON -> Map
export const loadCacheSchedules = async (): Promise<ParsedWingsSchedules | 'No Cache'> => {
  try {
    const CACHE_PATH = path.join(ENV.CACHE_DIR, ENV.SCHEDULE_FILE_JSON);
    const loadFile = await fs.readFile(CACHE_PATH, 'utf-8');
    return new Map(Object.entries(JSON.parse(loadFile)));
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      return 'No Cache';
    }
    throw err;
  }
};

export const loadCacheCalendar = async (): Promise<ParsedGoogleCalendar | 'No Cache'> => {
  try {
    const CACHE_PATH = path.join(ENV.CACHE_DIR, ENV.CALENDAR_FILE_JSON);
    const loadFile = await fs.readFile(CACHE_PATH, 'utf-8');
    return new Map(Object.entries(JSON.parse(loadFile)));
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      return 'No Cache';
    }
    throw err;
  }
};
