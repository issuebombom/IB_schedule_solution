import 'dotenv/config';
import { ENV } from '../../env';
import { wingsLogin } from '../modules/scraper/login';
import { getWingsScheduleDetails, getWingsSchedules } from '../modules/scraper/getSchedule';
import { requestRetry } from '../modules/utils/requestRetry';
import { loadCacheCalendar, loadCacheSchedules, saveCache } from '../modules/utils/cache';
import { deleteBatchGoogleCalendarEvent } from '../modules/apis/google/calendar';
import { compareWingsSchedules, updateNewWingsSchedules } from '../modules/sync/updateSchedule';
import { WingsSchedulesValues } from '../modules/types/schedules.type';
import { updateNewCalendarEvents } from '../modules/sync/updateCalendar';
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
  const [cacheSchedules, cacheCalender] = await Promise.all([
    loadCacheSchedules(),
    loadCacheCalendar(),
  ]);

  // ! 5-a. 캐시 없을 경우 초기화 작업 (스케줄 캐시 신규 저장, 캘린더 업데이트, 캘린더 캐시 신규 저장)
  if (cacheSchedules === 'No Cache' || cacheCalender === 'No Cache') {
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

  // ! 6. 신규 데이터 업데이트
  if (newEventNumbers.size > 0) {
    // 캐시 스케줄 업데이트
    updateNewWingsSchedules(newEventNumbers, currSchedules, cacheSchedules);

    // 구글 캘린더 및 캐시 캘린더 업데이트
    // NOTE: 구글 캘린더 업데이트 후 응답 데이터를 캐시로 저장해야 하므로 기다려야 함
    await updateNewCalendarEvents(newEventNumbers, currSchedules, cacheCalender);

    // ! DEBUG
    console.log(`총 ${newEventNumbers.size}개의 신규 스케줄을 업데이트했습니다.`);
  }

  // ! 7. 변경 데이터 업데이트
  if (diffEventNumbers.size > 0) {
    const diffSchedules: WingsSchedulesValues[] = [];
    const canceledSchedules: WingsSchedulesValues[] = [];
    // NOTE: 내용 변경과 삭제 대상을 분리
    for (const eNumber of diffEventNumbers) {
      const diffSchedule = currSchedules.get(eNumber);
      if (diffSchedule) {
        cacheSchedules.set(eNumber, diffSchedule); // 변경 내용으로 덮어쓰기
        if (diffSchedule.status === 'CXL') {
          // 행사 취소로 변경된 경우 캘린더 삭제 대상으로 등록
          canceledSchedules.push(diffSchedule);
          continue;
        }
        // 캘린더 변경 대상으로 등록
        diffSchedules.push(diffSchedule);
      }
    }
    // ! 7-a. 취소 일정은 구글캘린더에서 삭제
    if (canceledSchedules.length > 0) {
      const eventIds: Map<string, string> = new Map();
      for (const schedule of canceledSchedules) {
        // 캘린더 이벤트 ID 확보
        const calendar = cacheCalender.get(schedule.eventNumber);
        if (calendar && typeof calendar.id === 'string') {
          // [스케줄 ID : 캘린더 이벤트 ID] 형태로 수집
          eventIds.set(schedule.eventNumber, calendar.id);
          // 캐시 캘린더에서 삭제
          cacheCalender.delete(schedule.eventNumber);
        }
      }
      // 구글 캘린더에서 이벤트 삭제
      deleteBatchGoogleCalendarEvent(eventIds);
      // ! DEBUG
      console.log(`총 ${eventIds.size}개의 일정을 취소(삭제)했습니다.`);
    }
    // TODO: 캘린더 Batch PUT하기
  }

  // 업데이트 후 최종 저장
  saveCache(cacheSchedules, ENV.SCHEDULE_FILE_JSON);
  saveCache(cacheCalender, ENV.CALENDAR_FILE_JSON);

  return;
};
