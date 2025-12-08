import 'dotenv/config';
import { wingsLogin } from '../modules/scraper/login';
import { getWingsScheduleDetails, getWingsSchedules } from '../modules/scraper/getSchedule';
import * as fs from 'fs/promises';
import { requestRetry } from '../modules/utils/requestRetry';

// 스크랩 실행 함수
export const scrapeOrchestrator = async (startDate: string, endDate: string) => {
  // ! 1. 로그인 및 세션ID 획득 (retry 3)
  const sessionId = await requestRetry(wingsLogin);

  // ! 2. 스케줄 스크랩
  const schedules = await getWingsSchedules({ startDate, endDate, sessionId });

  // ! 3. 참조사항 스크랩 (스케줄 정보가 있어야 참조사항 스크랩이 가능)
  const scheduleDetails = await getWingsScheduleDetails({ schedules, sessionId });

  // ! 4. 참조사항을 스케줄 details 항목에 추가
  for (const obj of scheduleDetails) {
    // 참조사항이 없는 스케줄은 건너뜀
    if (obj.details.length === 0) continue;

    const schedule = schedules.get(parseInt(obj.eventNo));
    if (schedule) schedule.details = obj.details;
  }

  return schedules;
};
