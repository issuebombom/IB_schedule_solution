import 'dotenv/config';
import { ENV } from '../../env';
import { wingsLogin } from '../modules/scraper/login';
import { getWingsScheduleDetails, getWingsSchedules } from '../modules/scraper/getSchedule';
import { requestRetry } from '../modules/utils/requestRetry';
import { loadCacheCalendar, loadCacheSchedules, saveCache } from '../modules/utils/cache';
import { compareWingsSchedules, updateWingsSchedules } from '../modules/sync/updateSchedule';
import {
  updateChangedCalendarEvents,
  updateNewCalendarEvents,
} from '../modules/sync/updateCalendar';
import { initCacheCalendar } from '../modules/sync/initializeCache';

// 스크랩 실행 함수
export const scrapeOrchestrator = async (startDate: string, endDate: string) => {
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
    loadCacheSchedules(),
    loadCacheCalendar(),
  ]);

  // ! 5-a. 캐시 없을 경우 초기화 작업 (스케줄 캐시 신규 저장, 캘린더 업데이트, 캘린더 캐시 신규 저장)
  if (cacheSchedules === 'No Cache' || cacheCalendar === 'No Cache') {
    // NOTE: 구글 캘린더 등록 (기존 캘린더는 비워져 있어야 중복되지 않음 주의)
    const updatedCalendars = await initCacheCalendar(currSchedules);
    // 스케줄 캐시데이터 등록
    saveCache(currSchedules, ENV.SCHEDULE_FILE_JSON);
    // 캘린더 캐시데이터 등록
    saveCache(updatedCalendars, ENV.CALENDAR_FILE_JSON);

    return '초기화 설정 완료';
  }

  // ! 5-b. 캐시 데이터와 비교하기
  const compareResult = compareWingsSchedules(currSchedules, cacheSchedules);
  const { newEventNumbers, diffEventNumbers, diffEventFieldValue } = compareResult;

  // ! 6. 신규 및 수정 데이터 업데이트
  if (newEventNumbers.size + diffEventNumbers.size > 0) {
    // 캐시 스케줄에 일괄 업데이트
    const eventNumbersUnion = new Set([...newEventNumbers, ...diffEventNumbers]);
    updateWingsSchedules(eventNumbersUnion, currSchedules, cacheSchedules);

    // ! 6-a. 신규 데이터 캘린더 업데이트
    if (newEventNumbers.size > 0) {
      // 구글 캘린더 및 캐시 캘린더 업데이트
      // NOTE: 구글 캘린더 업데이트 후 응답 데이터를 캐시로 저장해야 하므로 기다려야 함
      const updatedNewCalendars = await updateNewCalendarEvents(
        newEventNumbers,
        currSchedules,
        cacheCalendar,
      );

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
      const updatedChangedCalendars = await updateChangedCalendarEvents(
        diffEventNumbers,
        currSchedules,
        cacheCalendar,
      );

      // 수정 목록 보여주기 (추후 로깅으로 변경)
      for (const [key, value] of updatedChangedCalendars) {
        console.log(`${key}: `, value.extendedProperties?.shared);
      }
    }
  }

  // 세부 변경 사항 확인
  console.log(diffEventFieldValue);

  // 업데이트 후 최종 저장
  saveCache(cacheSchedules, ENV.SCHEDULE_FILE_JSON);
  saveCache(cacheCalendar, ENV.CALENDAR_FILE_JSON);

  return;
};
