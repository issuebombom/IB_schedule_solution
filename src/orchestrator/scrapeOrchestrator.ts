import 'dotenv/config';
import { wingsLogin } from '../modules/scraper/login';
import { getWingsScheduleDetails, getWingsSchedules } from '../modules/scraper/getSchedule';
import { requestRetry } from '../modules/utils/requestRetry';
import {
  deleteCacheCalendarFromRedis,
  loadCacheCalendarFromRedis,
  loadCacheSchedulesFromRedis,
  RedisNamespace,
  saveCacheToRedis,
} from '../modules/utils/cache';
import { compareWingsSchedules, updateWingsSchedules } from '../modules/sync/updateSchedule';
import {
  updateChangedCalendarEvents,
  updateNewCalendarEvents,
} from '../modules/sync/updateCalendar';
import { initCacheCalendar } from '../modules/sync/initializeCache';
import { FatalError } from '../modules/utils/appError';
import { log, LogLevel } from '../modules/utils/logger';

// 스크랩 실행 함수
export const scrapeOrchestrator = async (startDate: string, endDate: string) => {
  try {
    // ! 1. 로그인 및 세션ID 획득 (retry 3)
    const sessionId = await requestRetry(wingsLogin);

    // ! 2. 스케줄 스크랩
    const currSchedules = await getWingsSchedules({ startDate, endDate, sessionId });

    // ! 3. 참조사항 스크랩 (스케줄 정보가 있어야 참조사항 스크랩이 가능)
    const scheduleDetails = await getWingsScheduleDetails({ schedules: currSchedules, sessionId });

    // ! 4. 참조사항을 스케줄 details 항목에 추가
    for (const obj of scheduleDetails) {
      // 참조사항이 없는 스케줄은 건너뜀
      if (obj.details.length === 0) continue;

      const schedule = currSchedules.get(obj.eventNo);
      if (schedule) schedule.details = obj.details;
    }

    // ! 5. 기존 데이터(캐시) 불러오기
    const [cacheSchedules, cacheCalendar] = await Promise.all([
      loadCacheSchedulesFromRedis(currSchedules, RedisNamespace.WINGS_SCHEDULES),
      loadCacheCalendarFromRedis(currSchedules, RedisNamespace.GOOGLE_CALENDAR_EVENTS),
    ]);

    // ! 5-a. 캐시 없을 경우 초기화 작업 (스케줄 캐시 신규 저장, 캘린더 업데이트, 캘린더 캐시 신규 저장)
    if (cacheSchedules === 'No Cache' || cacheCalendar === 'No Cache') {
      // ! LOG
      log(LogLevel.INFO, {
        step: 'INIT_CACHE_UPDATE',
        message: `신규 스케줄 등록 진행`,
      });

      // NOTE: 구글 캘린더 등록 (기존 캘린더는 비워져 있어야 중복되지 않음 주의)
      const updatedCalendars = await initCacheCalendar(currSchedules);
      // 스케줄 캐시데이터 등록
      if (cacheSchedules === 'No Cache') {
        await saveCacheToRedis(currSchedules, RedisNamespace.WINGS_SCHEDULES);
      }
      // 캘린더 캐시데이터 등록
      if (cacheCalendar === 'No Cache') {
        await saveCacheToRedis(updatedCalendars, RedisNamespace.GOOGLE_CALENDAR_EVENTS);
      }

      // ! LOG
      log(LogLevel.INFO, {
        step: 'INIT_CACHE_UPDATE',
        message: `신규 스케줄 등록 및 캐시 저장 성공`,
      });

      return '초기화 설정 완료';
    }

    // ! 5-b. 캐시 데이터와 비교하기
    const compareResult = compareWingsSchedules(currSchedules, cacheSchedules);
    const { newEventNumbers, diffEventNumbers, diffEventFieldValue } = compareResult;

    // ! LOG
    log(LogLevel.INFO, {
      step: 'CHANGES_DETECTED',
      message: `발견된 신규 스케줄: ${newEventNumbers.size} | 발견된 변동 스케줄: ${diffEventNumbers.size}`,
    });

    // ! 6. 신규 및 수정 데이터 업데이트
    if (newEventNumbers.size + diffEventNumbers.size > 0) {
      // 캐시 스케줄에 일괄 업데이트
      const eventNumbersUnion = new Set([...newEventNumbers, ...diffEventNumbers]);
      const updatedSchedules = updateWingsSchedules(eventNumbersUnion, currSchedules);
      saveCacheToRedis(updatedSchedules, RedisNamespace.WINGS_SCHEDULES);

      // ! 6-a. 신규 데이터 캘린더 업데이트
      if (newEventNumbers.size > 0) {
        // 구글 캘린더 및 캐시 캘린더 업데이트
        // NOTE: 구글 캘린더 업데이트 후 응답 데이터를 캐시로 저장해야 하므로 기다려야 함
        const updatedNewCalendars = await updateNewCalendarEvents(newEventNumbers, currSchedules);
        saveCacheToRedis(updatedNewCalendars, RedisNamespace.GOOGLE_CALENDAR_EVENTS);

        // 생성 목록 보여주기 (추후 로깅으로 변경)
        for (const [key, value] of updatedNewCalendars) {
          console.log(`${key}: `, value.extendedProperties?.shared);
        }
      }

      // ! 6-b. 변경 데이터 캘린더 업데이트
      if (diffEventNumbers.size > 0) {
        /** 구글 캘린더 및 캐시 캘린더 업데이트
         * 구글 캘린더 업데이트 후 응답 데이터를 캐시로 저장해야 하므로 기다려야 함
         * 취소된 스케줄은 캘린더 및 캐시 캘린더에서 완전 삭제
         * */
        const { updatedCalendars: updatedChangedCalendars, deletedCalendars } =
          await updateChangedCalendarEvents(diffEventNumbers, currSchedules, cacheCalendar);

        // 변경 사항에 대한 PUT
        saveCacheToRedis(updatedChangedCalendars, RedisNamespace.GOOGLE_CALENDAR_EVENTS);
        // 변경 사항에 대한 DELETE
        deleteCacheCalendarFromRedis(deletedCalendars, RedisNamespace.GOOGLE_CALENDAR_EVENTS);

        // 수정 목록 보여주기 (추후 로깅으로 변경)
        for (const [key, value] of updatedChangedCalendars) {
          console.log(`${key}: `, value.extendedProperties?.shared);
        }
      }
    }
    // 세부 변경 사항 확인
    console.log(diffEventFieldValue);

    // TODO: report 형태가 출력되게 할 것
    return;
  } catch (err: unknown) {
    // 치명적인 에러를 슬랙 알림 등 알림 처리를 함
    if (err instanceof FatalError) {
      log(LogLevel.ERROR, { step: err.name, message: err.message });
    } else {
      if (err instanceof Error) {
        log(LogLevel.ERROR, { step: err.name, message: err.message });
      } else {
        log(LogLevel.ERROR, {
          step: 'UNCLASSIFIED_ERROR',
          message: '알 수 없는 오류가 발생했습니다.',
        });
      }
    }
    throw err;
  }
};
