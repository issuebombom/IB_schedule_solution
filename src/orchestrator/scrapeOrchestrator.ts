import 'dotenv/config';
import { ENV } from '../../env';
import { wingsLogin } from '../modules/scraper/login';
import { getWingsScheduleDetails, getWingsSchedules } from '../modules/scraper/getSchedule';
import { requestRetry } from '../modules/utils/requestRetry';
import { loadCacheCalendar, loadCacheSchedules, saveCache } from '../modules/utils/cache';
import { createBatchGoogleCalendarEvent } from '../modules/apis/google/calendar';
import { compareWingsSchedules } from '../modules/scraper/updateSchedule';
import { WingsSchedulesValues } from '../modules/types/schedules.type';

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
  const [cacheSchedules, cacheCalender] = await Promise.all([
    loadCacheSchedules(),
    loadCacheCalendar(),
  ]);

  // ! 5-a. 캐시 없을 경우 초기화 작업 (스케줄 캐시 신규 저장, 캘린더 업데이트, 캘린더 캐시 신규 저장)
  if (cacheSchedules === 'No Cache' || cacheCalender === 'No Cache') {
    // NOTE: 신규 캘린더 등록 (기존 캘린더는 비워져 있어야 중복되지 않음 주의)
    const filteredSchedules = [];
    for (const [_, value] of currSchedules) {
      if (value.status === 'CXL') continue; // CXL 처리된 데이터는 필터링 필요
      filteredSchedules.push(value);
    }
    // ! 1000개 이상 Batch를 올릴 수 없다.
    if (filteredSchedules.length >= 1000)
      throw new Error('구글 캘린더 배치 한도수를 초과했습니다.');
    const updatedCalendars = await createBatchGoogleCalendarEvent(filteredSchedules);

    // 스케줄 캐시데이터 등록
    saveCache(currSchedules, ENV.SCHEDULE_FILE_JSON);
    // 캘린더 캐시데이터 등록
    saveCache(updatedCalendars, ENV.CALENDAR_FILE_JSON);

    return '초기화 설정 완료';
  }

  // ! 5-b. 캐시 데이터와 비교하기
  const compareResult = compareWingsSchedules(currSchedules, cacheSchedules);
  const { newEventNumbers, diffEventNumbers, diffEventFieldValue } = compareResult;

  // ! 6. 신규 데이터 업데이트
  if (newEventNumbers.size > 0) {
    const newSchedules: WingsSchedulesValues[] = [];
    newEventNumbers.forEach((eNumber: string) => {
      const newSchedule = currSchedules.get(eNumber);
      if (newSchedule) {
        cacheSchedules.set(eNumber, newSchedule);
        newSchedules.push(newSchedule);
      }
    });

    // 신규 캘린더 등록
    const filteredNewSchedules = newSchedules.filter((s) => s.status !== 'CXL');
    const updatedCalendars = await createBatchGoogleCalendarEvent(filteredNewSchedules);
    for (const [key, value] of updatedCalendars) {
      cacheCalender.set(key, value);
    }

    // ! DEBUG
    console.log(`총 ${newEventNumbers.size}개의 신규 데이터를 업데이트했습니다.`);
  }

  // 업데이트 후 최종 저장
  saveCache(cacheSchedules, ENV.SCHEDULE_FILE_JSON);
  saveCache(cacheCalender, ENV.CALENDAR_FILE_JSON);

  // TODO: 스케줄 변동사항 있을 시 기존 캘린더 이벤트 덮어쓰기

  // TODO: 취소 스케줄 있을 시 기존 캘린더 이벤트 삭제하기

  return;
};
