import { parse } from 'date-fns';
import {
  ParsedWingsSchedules,
  WingsScheduleDetails,
  wingsScheduleDetailsSchema,
  WingsSchedules,
  wingsSchedulesSchema,
} from '../types/schedules.type';
import { formatInTimeZone } from 'date-fns-tz';

export const parseWingsSchedule = (input: WingsSchedules): ParsedWingsSchedules => {
  // validation
  const data = wingsSchedulesSchema.parse(input);

  // NOTE: Map 구조로 만들어서 추후 참조사항 추가 및 비교 수정에 유리하도록 한다.
  const parsedData = new Map(
    data.map((obj) => {
      // 시간 데이터 전처리
      const eventDate = obj.EVENT_DATE;
      const [startHM, endHM] = obj.EVENT_TIME.split('~');

      const startDt = parse(
        eventDate + startHM?.replace(':', '') + '00',
        'yyyyMMddHHmmss',
        new Date(),
      ).toISOString(); // toString

      const startTime = formatInTimeZone(startDt, 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ssXXX");

      const endDt = parse(
        eventDate + endHM?.replace(':', '') + '00',
        'yyyyMMddHHmmss',
        new Date(),
      ).toISOString(); // toString

      const endTime = formatInTimeZone(endDt, 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ssXXX");

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
