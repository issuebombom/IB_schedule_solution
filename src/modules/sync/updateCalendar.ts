import {
  createBatchGoogleCalendarEvent,
  deleteBatchGoogleCalendarEvent,
  updateBatchGoogleCalendarEvent,
} from '../apis/google/calendar';
import { ParsedGoogleCalendar } from '../types/calendar.type';
import { ParsedWingsSchedules, WingsSchedulesValues } from '../types/schedules.type';
import { log, LogLevel } from '../utils/logger';

export const updateNewCalendarEvents = async (
  newEventNumbers: Set<string>,
  currSchedules: ParsedWingsSchedules,
) => {
  const targetSchedules: WingsSchedulesValues[] = [];
  newEventNumbers.forEach((eNumber: string) => {
    const schedule = currSchedules.get(eNumber);
    // 취소 설정된 신규 일정은 캘린더 등록 안함
    if (schedule && schedule.status !== 'CXL') {
      targetSchedules.push(schedule);
    }
  });

  // 구글 캘린더 배치 업데이트 및 캐시 캘린더 업데이트
  const updatedCalendars = await createBatchGoogleCalendarEvent(targetSchedules);

  // ! LOG
  log(LogLevel.INFO, {
    step: 'UPDATE_CALENDAR',
    message: `총 ${updatedCalendars.size}개의 캘린더 이벤트를 업데이트했습니다.`,
  });

  return updatedCalendars;
};

export const updateChangedCalendarEvents = async (
  diffEventNumbers: Set<string>,
  currSchedules: ParsedWingsSchedules,
  cacheCalendar: ParsedGoogleCalendar,
) => {
  const changedSchedules: WingsSchedulesValues[] = [];
  const canceledSchedules: WingsSchedulesValues[] = [];
  diffEventNumbers.forEach((eNumber: string) => {
    const schedule = currSchedules.get(eNumber);
    if (schedule) {
      if (schedule.status === 'CXL') {
        canceledSchedules.push(schedule);
      } else {
        changedSchedules.push(schedule);
      }
    }
  });

  // NOTE: 취소 일정은 캐시 및 구글캘린더에서 삭제
  const deletedCalendars: ParsedGoogleCalendar = new Map();
  if (canceledSchedules.length > 0) {
    const eventIds: Map<string, string> = new Map();
    for (const schedule of canceledSchedules) {
      // 캘린더 이벤트 ID 확보
      const calendar = cacheCalendar.get(schedule.eventNumber);
      if (calendar && typeof calendar.id === 'string') {
        // [스케줄 ID : 캘린더 이벤트 ID] 형태로 수집
        eventIds.set(schedule.eventNumber, calendar.id);
        deletedCalendars.set(schedule.eventNumber, calendar);
      }
    }
    // 구글 캘린더에서 취소된 이벤트는 삭제 (응답 바디 없음)
    if (eventIds.size > 0) {
      await deleteBatchGoogleCalendarEvent(eventIds);

      // ! LOG
      log(LogLevel.INFO, {
        step: 'DELETE_CALENDAR',
        message: `총 ${eventIds.size}개의 캘린더 이벤트를 삭제했습니다.`,
      });
    }
  }

  // 내용 변경된 캘린더 정보 업데이트
  let updatedCalendars: ParsedGoogleCalendar = new Map();
  if (changedSchedules.length > 0) {
    updatedCalendars = await updateBatchGoogleCalendarEvent(changedSchedules, cacheCalendar);

    // ! LOG
    log(LogLevel.INFO, {
      step: 'UPDATE_CALENDAR',
      message: `총 ${updatedCalendars.size}개의 캘린더 이벤트를 수정했습니다.`,
    });
  }

  return { updatedCalendars, deletedCalendars };
};
