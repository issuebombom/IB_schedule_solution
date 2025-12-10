import { parse } from 'date-fns';
import {
  ParsedWingsSchedules,
  WingsScheduleDetails,
  wingsScheduleDetailsSchema,
  WingsSchedules,
  wingsSchedulesSchema,
} from '../types/schedules.type';

export const parseWingsSchedule = (input: WingsSchedules): ParsedWingsSchedules => {
  // validation
  const data = wingsSchedulesSchema.parse(input);

  // NOTE: Map 구조로 만들어서 추후 참조사항 추가 및 비교 수정에 유리하도록 한다.
  const parsedData = new Map(
    data.map((obj) => {
      // 시간 데이터 전처리
      const eventDate = obj.EVENT_DATE;
      const [startHM, endHM] = obj.EVENT_TIME.split('~');

      const startTime = parse(
        eventDate + startHM?.replace(':', '') + '00',
        'yyyyMMddHHmmss',
        new Date(),
      ).toISOString(); // toString

      const endTime = parse(
        eventDate + endHM?.replace(':', '') + '00',
        'yyyyMMddHHmmss',
        new Date(),
      ).toISOString(); // toString

      return [
        obj.EVENT_NO,
        {
          eventName: obj.FNC_NAME_ORG,
          startTime,
          endTime,
          place: obj.FNC_ROOM_NAME,
          type: obj.FNC_TYPE_NAME,
          status: obj.FNC_STATUS_CODE,
          manager: obj.SALE_MANAGER,
          eventNumber: obj.EVENT_NO, // ID로 사용
          eventRsvnNumber: obj.FNC_RSVN_NO,
          details: [],
        },
      ];
    }),
  );
  return parsedData;
};

// 개행 기준으로 분리된 참조 사항을 리스트형태로 변경
export const parseOneWingsScheduleDetails = (input: WingsScheduleDetails) => {
  // validation
  const data = wingsScheduleDetailsSchema.parse(input);

  const parsedData = data.map((obj) => obj.TEXT.trim());
  return parsedData;
};

// 구글 캘린더 배치 이벤트 등록 요청 후 응답 데이터(TEXT)에 대한 파싱
export const parseBatchGoogleResponse = (raw: string) => {
  const result: Record<string, ParsedBatchResponse> = {};

  // boundary block 단위로 분리
  const parts = raw.split(/--batch_[A-Za-z0-9]+/g);

  for (const part of parts) {
    if (!part.includes('Content-ID')) continue;

    // 1) Content-ID 숫자 추출
    const idMatch = part.match(/Content-ID:\s*<response-item\d+:\s*(\d+)>/);
    if (!idMatch) continue;
    const key = idMatch[1] as string; // 숫자 문자열 (캡처 그룹 결과: string 보장)

    // 2) JSON 본문 추출
    const jsonMatch = part.match(/\{[\s\S]*\}/);
    if (!jsonMatch) continue;

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      continue;
    }

    result[key] = parsed;
  }

  return result;
};

export type ParsedBatchResponse = {
  kind?: string;
  id?: string;
  status?: string;
  htmlLink?: string;
  [k: string]: any;
};
