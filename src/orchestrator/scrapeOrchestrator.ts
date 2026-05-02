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
import { PlaceColorIdMapper } from '../modules/apis/google/colorIdMapper';
import { initCacheCalendar } from '../modules/sync/initializeCache';
import { FatalError } from '../modules/utils/appError';
import { log, LogLevel } from '../modules/utils/logger';
import { ReportCollector } from '../modules/utils/report';
import { SlackAlert } from '../modules/apis/slack/alert';
import { ENV } from '../../env';

// 스크랩 실행 함수
export const scrapeOrchestrator = async (startDate: string, endDate: string) => {
  const CALENDAR_REQUEST_LIMIT = ENV.GOOGLE_CALENDAR_REQUEST_LIMIT;

  const report = new ReportCollector({ startDate, endDate });
  const notice = new SlackAlert(ENV.SLACK_SCHEADULE_CHANNEL_ID, ENV.SLACK_BOT_TOKEN);
  const warning = new SlackAlert(ENV.SLACK_LOG_CHANNEL_ID, ENV.SLACK_BOT_TOKEN);

  PlaceColorIdMapper.load(); // placeColorId 맵 데이터 가져오기

  try {
    // ! 1. 로그인 및 세션ID 획득 (retry 3)
    const sessionId = await report.step('WINGS_LOGIN', async () => {
      return requestRetry(wingsLogin);
    });

    // ! 2. 스케줄 스크랩
    const currSchedules = await report.step('GET_WINGS_SCHEDULES', async () => {
      const scrapedMap = await getWingsSchedules({ startDate, endDate, sessionId });
      report.addDetail('GET_WINGS_SCHEDULES', { count: scrapedMap.size });
      return scrapedMap;
    });

    // ! 3. 참조사항 스크랩 (스케줄 정보가 있어야 참조사항 스크랩이 가능)
    const scheduleDetails = await report.step('GET_WINGS_SCHEDULE_DETAILS', async () => {
      return getWingsScheduleDetails({ schedules: currSchedules, sessionId });
    });

    // ! 4. 참조사항을 스케줄 details 항목에 추가
    for (const obj of scheduleDetails) {
      // 참조사항이 없는 스케줄은 건너뜀
      if (obj.details.length === 0) continue;

      const schedule = currSchedules.get(obj.eventNo);
      if (schedule) schedule.details = obj.details;
    }

    // ! 5. 기존 데이터(캐시) 불러오기
    const [cacheSchedules, cacheCalendar] = await report.step('LOAD_CACHE_FROM_REDIS', async () => {
      const keys: string[] = [...currSchedules.keys()]; // key 추출
      return Promise.all([
        loadCacheSchedulesFromRedis(keys, RedisNamespace.WINGS_SCHEDULES),
        loadCacheCalendarFromRedis(keys, RedisNamespace.GOOGLE_CALENDAR_EVENTS),
      ]);
    });

    // ! 5-a. 캐시 없을 경우 초기화 작업 (스케줄 캐시 신규 저장, 캘린더 업데이트, 캘린더 캐시 신규 저장)
    if (cacheSchedules === 'No Cache' || cacheCalendar === 'No Cache') {
      // ! LOG
      log(LogLevel.INFO, {
        step: 'INIT_CACHE_CREATE',
        message: `저장된 캐시가 없어 초기 등록을 시작합니다.`,
      });

      // NOTE: 구글 캘린더 등록 (기존 캘린더는 비워져 있어야 중복되지 않음 주의)
      await report.step('INIT_CACHE_CREATE', async () => {
        const updatedCalendars = await initCacheCalendar(currSchedules);
        // 스케줄 캐시데이터 등록
        if (cacheSchedules === 'No Cache') {
          await saveCacheToRedis(currSchedules, RedisNamespace.WINGS_SCHEDULES);
        }
        // 캘린더 캐시데이터 등록
        if (cacheCalendar === 'No Cache') {
          await saveCacheToRedis(updatedCalendars, RedisNamespace.GOOGLE_CALENDAR_EVENTS);
        }
      });

      // ! LOG
      log(LogLevel.INFO, {
        step: 'INIT_CACHE_CREATE',
        message: `스케줄 초기 등록 및 캐시 저장 완료`,
      });

      return report.build();
    }

    // ! 5-b. 캐시 데이터와 비교하기
    const compareResult = compareWingsSchedules(currSchedules, cacheSchedules);
    const { newEventNumbers, diffEventNumbers, diffEventFieldValues } = compareResult;

    // ! 6. 신규 및 수정 데이터 업데이트
    if (newEventNumbers.size + diffEventNumbers.size > 0) {
      // 캐시 스케줄에 일괄 업데이트
      const eventNumbersUnion = new Set([...newEventNumbers, ...diffEventNumbers]);

      await report.step('UPDATE_SCHEDULES', async () => {
        const updatedSchedules = updateWingsSchedules(eventNumbersUnion, currSchedules);
        await saveCacheToRedis(updatedSchedules, RedisNamespace.WINGS_SCHEDULES);
        report.addDetail('UPDATE_SCHEDULES', { count: updatedSchedules.size });
      });

      // ! 6-a. 신규 데이터 캘린더 업데이트
      if (newEventNumbers.size > 0) {
        // 구글 캘린더 및 캐시 캘린더 업데이트
        // NOTE: 구글 캘린더 업데이트 후 응답 데이터를 캐시로 저장해야 하므로 기다려야 함
        await report.step('UPDATE_NEW_CALENDARS', async () => {
          // 신규 이벤트 수가 LIMIT을 초과할 경우 INFO
          if (newEventNumbers.size > CALENDAR_REQUEST_LIMIT) {
            report.addIssue(LogLevel.WARN, {
              step: 'UPDATE_NEW_CALENDARS',
              message: `요청수 한도 초과로 ${CALENDAR_REQUEST_LIMIT}개의 이벤트만 등록됩니다. (${newEventNumbers.size}/${CALENDAR_REQUEST_LIMIT}`,
            });
          }
          const updatedNewCalendars = await updateNewCalendarEvents(newEventNumbers, currSchedules);
          await saveCacheToRedis(updatedNewCalendars, RedisNamespace.GOOGLE_CALENDAR_EVENTS);

          // ! 신규 스케줄 슬랙 알림 전송
          const { subject, message } = notice.newEventMessage(newEventNumbers, updatedNewCalendars);
          await notice.sendMessage(subject, message);

          report.addDetail('UPDATE_NEW_CALENDARS', { count: updatedNewCalendars.size });
        });
      }

      // ! 6-b. 변경 데이터 캘린더 업데이트
      if (diffEventNumbers.size > 0) {
        /** 구글 캘린더 및 캐시 캘린더 업데이트
         * 구글 캘린더 업데이트 후 응답 데이터를 캐시로 저장해야 하므로 기다려야 함
         * 취소된 스케줄은 캘린더 및 캐시 캘린더에서 완전 삭제
         * */
        await report.step('UPDATE_CHANGED_CALENDARS', async () => {
          const { updatedCalendars: updatedChangedCalendars, deletedCalendars } =
            await updateChangedCalendarEvents(diffEventNumbers, currSchedules, cacheCalendar);

          // 변경 사항에 대한 UPDATE
          if (updatedChangedCalendars.size > 0) {
            await saveCacheToRedis(updatedChangedCalendars, RedisNamespace.GOOGLE_CALENDAR_EVENTS);
          }

          // 변경 사항에 대한 DELETE
          if (deletedCalendars.size > 0)
            await deleteCacheCalendarFromRedis(
              deletedCalendars,
              RedisNamespace.GOOGLE_CALENDAR_EVENTS,
            );
          report.addDetail('UPDATE_CHANGED_CALENDARS', {
            count: updatedChangedCalendars.size + deletedCalendars.size,
          });

          // ! 변경 스케줄 슬랙 알림 전송
          const { subject, message } = notice.changedEventMessage(diffEventFieldValues);
          await notice.sendMessage(subject, message);
        });

        // 세부 변경 사항 리포팅
        report.addDetail('UPDATE_CHANGED_CALENDARS', {
          diff: diffEventFieldValues,
        });
      }
      return report.build();
    }
  } catch (err: unknown) {
    report.setStatus('FAILED');
    let step: string;
    let message: string;
    let stack: string | undefined;

    if (err instanceof FatalError) {
      step = (err.context?.step as string) ?? err.name;
      message = err.message;
      stack = err.stack;
    } else {
      if (err instanceof Error) {
        step = err.name;
        message = err.message;
        stack = err.stack;
      } else {
        step = 'UNCLASSIFIED_ERROR';
        message = '알 수 없는 오류';
      }
    }
    log(LogLevel.ERROR, { step, message });
    report.addIssue(LogLevel.ERROR, { step, message, error: stack });

    // 알림 전송
    const { subject, message: errMessage } = warning.errorMessage(step, message, stack);
    await warning.sendMessage(subject, errMessage);
  } finally {
    // report 형태가 출력되게 할 것
    return report.build();
  }
};
