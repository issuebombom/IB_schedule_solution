import { ENV } from '../../../env';
import { ParsedWingsSchedules, WingsSchedulesValues } from '../types/schedules.type';
import { ParsedBatchResponse, ParsedGoogleCalendar } from '../types/calendar.type';

import { Redis } from '@upstash/redis';
import { FatalError } from './appError';
import { log, LogLevel } from './logger';
const redis = new Redis({
  url: ENV.UPSTASH_REDIS_REST_URL,
  token: ENV.UPSTASH_REDIS_REST_TOKEN,
});

export enum RedisNamespace {
  WINGS_SCHEDULES = 'wings-schedules',
  GOOGLE_CALENDAR_EVENTS = 'google-calendar-events',
}

// Map -> Redis (namespace: { eNumber: values })
// upstash를 사용해서 stringify 생략
export const saveCacheToRedis = async (
  cacheMap: ParsedWingsSchedules | ParsedGoogleCalendar,
  namespace: RedisNamespace,
  ttlSeconds: number = 60 * 60 * 24 * 30 * 2, // 두 달
) => {
  const payload: Record<string, WingsSchedulesValues | ParsedBatchResponse> =
    Object.fromEntries(cacheMap);

  try {
    await redis.hset(namespace, payload);

    // Field TTL 적용
    if (ttlSeconds && ttlSeconds > 0) {
      const fields = Object.keys(payload);
      if (fields.length > 0) {
        await redis.hexpire(namespace, fields, ttlSeconds);
      }
    }

    log(LogLevel.INFO, {
      step: 'REDIS_SAVE_DATA_SUCCESS',
      message: `캐시 저장 성공 | namespace: ${namespace} | count: ${cacheMap.size}`,
    });
  } catch (err) {
    throw new FatalError(
      'REDIS_SAVE_DATA_FAILED',
      `${namespace}를 저장하는데 실패했습니다.`,
      { namespace },
      err,
    );
  }
};

// Redis ( { eNumber: values } ) -> Map
// upstash를 사용해서 parse 생략
export const loadCacheSchedulesFromRedis = async (
  keys: string[],
  namespace: RedisNamespace,
): Promise<ParsedWingsSchedules | 'No Cache'> => {
  try {
    const cacheData: Record<string, WingsSchedulesValues> | null = await redis.hmget(
      `${namespace}`,
      ...keys,
    );
    if (!cacheData) return 'No Cache';

    // null 값 제외
    const cleanCacheData: [string, WingsSchedulesValues][] = [];
    for (const [key, value] of Object.entries(cacheData)) {
      if (value) cleanCacheData.push([key, value]);
    }

    log(LogLevel.INFO, {
      step: 'REDIS_LOAD_SCHEDULE_SUCCESS',
      message: `캐시 불러오기 성공 | namespace: ${namespace} | count: ${cleanCacheData.length}`,
    });

    return new Map(cleanCacheData);
  } catch (err) {
    throw new FatalError(
      'REDIS_LOAD_SCHEDULE_FAILED',
      '캐시에서 스케줄 데이터를 가져오는데 실패했습니다.',
      { namespace },
      err,
    );
  }
};

// Redis ( { eNumber: values } ) -> Map
// upstash를 사용해서 parse 생략
export const loadCacheCalendarFromRedis = async (
  keys: string[],
  namespace: RedisNamespace,
): Promise<ParsedGoogleCalendar | 'No Cache'> => {
  try {
    const cacheData: Record<string, ParsedBatchResponse> | null = await redis.hmget(
      `${namespace}`,
      ...keys,
    );
    if (!cacheData) return 'No Cache';

    // null 값 제외
    const cleanCacheData: [string, ParsedBatchResponse][] = [];
    for (const [key, value] of Object.entries(cacheData)) {
      if (value) cleanCacheData.push([key, value]);
    }

    log(LogLevel.INFO, {
      step: 'REDIS_LOAD_CALENDAR_SUCCESS',
      message: `캐시 불러오기 성공 | namespace: ${namespace} | count: ${cleanCacheData.length}`,
    });

    return new Map(cleanCacheData);
  } catch (err) {
    throw new FatalError(
      'REDIS_LOAD_CALENDAR_FAILED',
      '캐시에서 캘린더 데이터를 가져오는데 실패했습니다.',
      { namespace },
      err,
    );
  }
};

export const deleteCacheCalendarFromRedis = async (
  cacheMap: ParsedGoogleCalendar,
  namespace: RedisNamespace,
) => {
  const keys: string[] = [...cacheMap.keys()];
  try {
    await redis.hdel(namespace, ...keys);

    log(LogLevel.INFO, {
      step: 'REDIS_DELETE_CALENDAR_SUCCESS',
      message: `캐시 삭제 성공 | namespace: ${namespace} | count: ${cacheMap.size}`,
    });
  } catch (err) {
    throw new FatalError(
      'REDIS_DELETE_CALENDAR_FAILED',
      '캐시에서 캘린더 데이터를 삭제하는데 실패했습니다.',
      { namespace, keys },
      err,
    );
  }
};
