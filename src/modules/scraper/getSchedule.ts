import { ENV } from '../../../env';
import axios from 'axios';
import pLimit from 'p-limit';
import { getMonthsRange } from '../utils/getDateRange';
import { parseOneWingsScheduleDetails, parseWingsSchedule } from '../parser/parseSchedule';
import {
  GetWingsScheduleDetails,
  GetWingsSchedules,
  getWingsSchedulesSchema,
  GetWingsScrapeResult,
  parsedWingsSchedulesSchema,
  WingsScheduleDetails,
  WingsSchedules,
} from '../types/schedules.type';
import { FatalError } from '../utils/appError';
import { log, LogLevel } from '../utils/logger';

// NOTE: 월 범위에 따른 스케줄 수집을 병렬로 진행 후 데이터 리턴
export const getWingsSchedules = async (input: GetWingsSchedules) => {
  const step = 'GET_WINGS_SCHEDULES';
  // validation
  const dto = getWingsSchedulesSchema.parse(input);

  // target date(months) array
  const monthsRange = getMonthsRange(dto.startDate, dto.endDate);
  // ! LOG
  log(LogLevel.INFO, {
    step,
    message: `스케줄 수집 범위 지정: ${monthsRange[0]} ~ ${monthsRange.at(-1)}`,
  });

  const promiseArray = monthsRange.map((searchDate) =>
    getOneWingsSchedule(searchDate, dto.sessionId),
  );
  const results = await Promise.allSettled(promiseArray);
  // 성공한 실제 데이터 추출
  const successfulData = results.flatMap((result) =>
    result.status === 'fulfilled' ? (result.value.rows as WingsSchedules) : [],
  );

  const failedRequests = results.flatMap((result) =>
    result.status === 'rejected' ? result.reason : [],
  ); // 실패 이유 추출

  if (successfulData.length === 0) {
    // 응답은 성공했으나 실제 스크랩된 데이터가 없을 경우
    throw new FatalError(
      'GET_SCHEDULE_FAILED',
      '스케줄이 정상적으로 수집되지 않았습니다. 응답 바디의 내부 구조 확인이 필요합니다.',
    );
  }
  if (failedRequests.length > 0) {
    // 전부 실패했을 경우 더이상 진행하지 않음
    if (failedRequests.length === monthsRange.length) {
      throw new FatalError(
        'SCHEDULE_REQUEST_ALL_FAILED',
        `스케줄 수집 요청에 실패했습니다. 요청 헤더 및 바디의 점검이 필요합니다`,
      );
    }
    log(LogLevel.WARN, {
      step: 'SCHEDULE_REQUEST_FAILED',
      message: `스케줄 수집 요청 실패 수: ${failedRequests.length}/${promiseArray.length}건`,
      error: failedRequests,
    });
  }

  // ! LOG
  log(LogLevel.INFO, {
    step,
    message: `${successfulData.length}개 스케줄 스크랩 성공`,
  });

  // ! NOTE: Map 타입으로 파싱
  const parsedData = parseWingsSchedule(successfulData);
  return parsedData;
};

// NOTE: 스케줄 참조사항 수집을 병렬로 진행
export const getWingsScheduleDetails = async (input: GetWingsScheduleDetails) => {
  const step = 'GET_WINGS_SCHEDULE_DETAILS';
  const dto = parsedWingsSchedulesSchema.parse(input.schedules);
  const limit = pLimit(30);
  const promiseArray = Array.from(dto).flatMap(([_, schedule]) =>
    schedule.status !== 'CXL' // 취소 처리된 스케줄은 참조사항 접근 불가하여 제외
      ? limit(() =>
          getOneWingsScheduleDetails(
            schedule.eventRsvnNumber,
            schedule.eventNumber,
            input.sessionId,
          ),
        )
      : [],
  );

  const results = await Promise.allSettled(promiseArray);

  // 실제 데이터 추출
  const successfulData = results.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : [],
  );

  // 실패 이유 추출
  const failedRequests = results.flatMap((result) =>
    result.status === 'rejected' ? result.reason : [],
  );

  if (failedRequests.length > 0) {
    log(LogLevel.WARN, {
      step: 'SCRAPE_SCHEDULE_DETAIL_FAILED',
      message: `스케줄 참조사항 수집 실패한 요청 수: ${failedRequests.length}/${promiseArray.length}건`,
      error: failedRequests,
    });
  }

  // 참조사항 실 수집 수
  const count = successfulData.filter((data) => data.details.length > 0).length;

  // ! LOG
  log(LogLevel.INFO, {
    step,
    message: `${count}개의 유효한 스케줄 참조사항 스크랩 성공`,
  });

  return successfulData;
};

// 지정 달에 대한 스케줄 데이터 조회
export async function getOneWingsSchedule(searchDate: string, sessionId: string) {
  const data = {
    BSNS_CODE: 11,
    STD_DATE: searchDate, // YYYYMM
    CHK_OPT: "'QTN', 'WAT', 'TEN', 'DEF', 'ACT', 'CXL'", // TEN: 가계약, DEF: 확정예약, ACT: 종료
  };

  const res = await axios.post(ENV.WINGS_SCHEDULE_URL, data, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8;',
      Cookie: `JSESSIONID=${sessionId}; WMONID=mTAbNtSvVLH;`,
    },
  });

  const results: GetWingsScrapeResult = res.data;
  return results;
}

// 각 스케줄에 등록된 참조 사항 데이터를 수집 (있을 수도 없을 수도 있음)
export async function getOneWingsScheduleDetails(
  fncRsvnNo: string, // 스케줄 수집 결과에 있는 데이터
  eventNo: string, // 스케줄 수집 결과에 있는 데이터
  sessionId: string,
) {
  const data = {
    BSNS_CODE: 11, // 11 고정
    FNC_RSVN_NO: fncRsvnNo,
    EVENT_NO: eventNo,
  };

  const res = await axios.post(ENV.WINGS_SCHEDULE_DETAILS_URL, data, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8;',
      Cookie: `JSESSIONID=${sessionId};`,
    },
  });

  // 데이터 전처리 (파싱)
  const results: GetWingsScrapeResult = res.data;
  const parsedDetails = parseOneWingsScheduleDetails(results.rows as WingsScheduleDetails);

  return { eventNo, details: parsedDetails };
}
