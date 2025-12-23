import fs from 'fs/promises';
import path from 'path';
import { ENV } from '../../../env';
import { ParsedWingsSchedules, WingsSchedulesValues } from '../types/schedules.type';
import { ParsedBatchResponse, ParsedGoogleCalendar } from '../types/calendar.type';

import { Redis } from '@upstash/redis';
const redis = new Redis({
  url: ENV.UPSTASH_REDIS_REST_URL,
  token: ENV.UPSTASH_REDIS_REST_TOKEN,
});

export enum RedisNamespace {
  WINGS_SCHEDULES = 'wings-schedules',
  GOOGLE_CALENDAR_EVENTS = 'google-calendar-events',
}

// Map 데이터 -> JSON파일 (로컬 저장)
export const saveCache = async (
  cacheMap: ParsedWingsSchedules | ParsedGoogleCalendar,
  fileName: string,
) => {
  const CACHE_PATH = path.join(ENV.CACHE_DIR, fileName);
  const obj = Object.fromEntries(cacheMap);
  await fs.writeFile(CACHE_PATH, JSON.stringify(obj));
};

// JSON파일 -> Map (로컬 읽기)
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

// JSON파일 -> Map (로컬 읽기)
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

// Map -> Redis (namespace: { eNumber: values })
// upstash를 사용해서 stringify 생략
export const saveCacheToRedis = async (
  cacheMap: ParsedWingsSchedules | ParsedGoogleCalendar,
  namespace: RedisNamespace,
) => {
  const payload: Record<string, WingsSchedulesValues | ParsedBatchResponse> = {};
  for (const [key, value] of cacheMap) {
    payload[key] = value;
  }

  await redis.hset(namespace, payload);
};

// Redis ( { eNumber: values } ) -> Map
// upstash를 사용해서 parse 생략
export const loadCacheSchedulesFromRedis = async (
  cacheMap: ParsedWingsSchedules,
  namespace: RedisNamespace,
): Promise<ParsedWingsSchedules | 'No Cache'> => {
  const keys: string[] = [];
  for (const [key, _] of cacheMap) {
    keys.push(key);
  }
  try {
    const cacheData: Record<string, WingsSchedulesValues> | null = await redis.hmget(
      `${namespace}`,
      ...keys,
    );
    if (!cacheData) return 'No Cache';

    return new Map(Object.entries(cacheData));
  } catch (err) {
    throw new Error('REDIS INTERVAL SERVER ERROR');
  }
};

// Redis ( { eNumber: values } ) -> Map
// upstash를 사용해서 parse 생략
export const loadCacheCalendarFromRedis = async (
  cacheMap: ParsedGoogleCalendar,
  namespace: RedisNamespace,
): Promise<ParsedGoogleCalendar | 'No Cache'> => {
  const keys: string[] = [];
  for (const [key, _] of cacheMap) {
    keys.push(key);
  }
  try {
    const cacheData: Record<string, ParsedBatchResponse> | null = await redis.hmget(
      `${namespace}`,
      ...keys,
    );
    if (!cacheData) return 'No Cache';

    return new Map(Object.entries(cacheData));
  } catch (err) {
    throw new Error('REDIS INTERVAL SERVER ERROR');
  }
};

export const deleteCacheCalendarFromRedis = async (
  cacheMap: ParsedGoogleCalendar,
  namespace: RedisNamespace,
) => {
  const keys = Array.from(cacheMap.keys());
  redis.hdel(namespace, ...keys);
};
