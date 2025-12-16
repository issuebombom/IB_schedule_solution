import { createBatchGoogleCalendarEvent } from '../apis/google/calendar';
import { ParsedGoogleCalendar } from '../types/calendar.type';
import { ParsedWingsSchedules, WingsSchedulesValues } from '../types/schedules.type';

export const updateNewCalendarEvents = async (
  newEventNumbers: Set<string>,
  currSchedules: ParsedWingsSchedules,
  cacheCalender: ParsedGoogleCalendar,
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
  for (const [key, value] of updatedCalendars) {
    cacheCalender.set(key, value);
  }
};

export const updateChangedCalendarEvents = async () => {};
