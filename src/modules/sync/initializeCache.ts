import { createBatchGoogleCalendarEvent } from '../apis/google/calendar';
import { ParsedWingsSchedules, WingsSchedulesValues } from '../types/schedules.type';

export const initCacheCalendar = async (currSchedules: ParsedWingsSchedules) => {
  // NOTE: 신규 캘린더 등록 (기존 캘린더는 비워져 있어야 중복되지 않음 주의)
  const filteredSchedules: WingsSchedulesValues[] = [];
  for (const [_, value] of currSchedules) {
    if (value.status === 'CXL') continue; // CXL 처리된 데이터는 필터링 필요
    filteredSchedules.push(value);
  }
  const updatedCalendars = await createBatchGoogleCalendarEvent(filteredSchedules);

  return updatedCalendars;
};
