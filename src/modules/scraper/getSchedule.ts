import { ENV } from '../../../env';
import axios, { AxiosError } from 'axios';
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

// NOTE: 월 범위에 따른 스케줄 수집을 병렬로 진행 후 데이터 리턴
export const getWingsSchedules = async (input: GetWingsSchedules) => {
  // validation
  const dto = getWingsSchedulesSchema.parse(input);

  // target date(months) array
  const monthsRange = getMonthsRange(dto.startDate, dto.endDate);

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

  if (failedRequests) {
    console.log(`스케줄 수집 실패한 요청 수: ${failedRequests.length}, 이유: ${failedRequests}`);
  }

  // ! NOTE: Map 타입으로 파싱
  const parsedData = parseWingsSchedule(successfulData);
  return parsedData;
};

// NOTE: 스케줄 참조사항 수집을 병렬로 진행
export const getWingsScheduleDetails = async (input: GetWingsScheduleDetails) => {
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

  if (failedRequests) {
    console.log(
      `스케줄 참조사항 수집 실패한 요청 수: ${failedRequests.length}, 이유: ${failedRequests}`,
    );
  }

  return successfulData;
};

// 지정 달에 대한 스케줄 데이터 조회
export async function getOneWingsSchedule(searchDate: string, sessionId: string) {
  try {
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
    // const parsedSchedule = parseOneWingsSchedule(results.rows as WingsSchedules);
    return results;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = (err as AxiosError).response?.status;
      console.error(`스케줄 수집 요청 처리 중 오류 발생 (상태 코드: ${status})`, err.message);
      // 에러를 던져 상위 호출자에게 전달
      throw new Error(`스케줄 수집 요청 실패: 상태 코드 ${status || '알 수 없음'}`);
    }

    // axios 오류가 아닌 다른 종류의 오류
    console.error('알 수 없는 요청 처리 중 오류 발생:', err);
    throw err;
  }
}

// 각 스케줄에 등록된 참조 사항 데이터를 수집 (있을 수도 없을 수도 있음)
export async function getOneWingsScheduleDetails(
  fncRsvnNo: string, // 스케줄 수집 결과에 있는 데이터
  eventNo: string, // 스케줄 수집 결과에 있는 데이터
  sessionId: string,
) {
  try {
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
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = (err as AxiosError).response?.status;
      console.error(
        `스케줄 참조사항 수집 요청 처리 중 오류 발생 (상태 코드: ${status})`,
        err.message,
      );
      // 에러를 던져 상위 호출자에게 전달
      throw new Error(`스케줄 참조사항 수집 요청 실패: 상태 코드 ${status || '알 수 없음'}`);
    }

    // axios 오류가 아닌 다른 종류의 오류
    console.error('알 수 없는 요청 처리 중 오류 발생:', err);
    throw err;
  }
}
