import { JWT } from 'google-auth-library';
import { ENV } from '../../../../env';
import { google } from 'googleapis';
import { WingsSchedulesValues } from '../../types/schedules.type';
import axios from 'axios';
import { parseBatchGoogleResponse, ParsedBatchResponse } from '../../parser/parseSchedule';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

// 인증
const authClient = new JWT({
  email: ENV.GOOGLE_CLIENT_EMAIL,
  key: ENV.GOOGLE_PRIVATE_KEY,
  scopes: SCOPES,
});

// 캘린더 API 클라이언트
const calendar = google.calendar({ version: 'v3', auth: authClient });

/** 캘린더 배치 이벤트 생성
 * REF: https://developers.google.com/workspace/calendar/api/guides/batch
 *
 * 공식 문서에 따라 multipart/mixed로 POST 요청을 한다.
 * 응답 데이터는 Text로 받으므로 gzip으로 받고, 이후 파싱 진행
 * 파싱 결과 구성은 eventNumber로 접근 시 캘린더의 eventId 획득을 골자로 한다.
 * 해당 기능은 응답을 기다려야 하며, 데이터양에 따른 서버 블로킹을 유발하므로 필요 시 백그라운드에서 수행할 것이 고려된다.
 */
export const createBatchGoogleCalendarEvent = async (events: WingsSchedulesValues[]) => {
  const batchRequestUrl = 'https://www.googleapis.com/batch/calendar/v3';
  const boundary = 'batch_boundary';
  const responseFieldsQuery = 'fields=kind,id,status,htmlLink'; // 응답 데이터 필드 선택 (전체를 받지 않음)
  const { token: accessToken } = await authClient.getAccessToken(); // 배치는 accessToken을 요구한다.

  let body = '';

  events.forEach((event, idx) => {
    body += `--${boundary}\r\n`;
    body += `Content-Type: application/http\r\n`;
    body += `Content-ID: <item${idx + 1}: ${event.eventNumber}>\r\n\r\n`;
    body += `POST /calendar/v3/calendars/${encodeURIComponent(ENV.GOOGLE_CALENDAR_ID)}/events?${responseFieldsQuery}\r\n`;
    body += `Content-Type: application/json; charset=UTF-8\r\n\r\n`;
    body += JSON.stringify(createEventRequestTemplate(event)) + '\r\n';
  });
  body += `--${boundary}--`;

  // Batch 요청
  const res = await axios.post(batchRequestUrl, body, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/mixed; boundary=${boundary}`,
      'Accept-Encoding': 'gzip', // 응답 용량 축소 (네트워크 비용 절감, 대량의 텍스트로 오므로)
    },
    responseType: 'text',
    transformResponse: (x) => x, // JSON 자동 파싱 방지
  });

  const responseText = res.data;

  // 파싱(전처리)
  const parsedData: ParsedBatchResponse = parseBatchGoogleResponse(responseText);

  return parsedData;
};

// 캘린더 단일 이벤트 등록
export const createOneGoogleCalendarEvent = async (schedule: WingsSchedulesValues) => {
  try {
    const res = await calendar.events.insert({
      calendarId: ENV.GOOGLE_CALENDAR_ID,
      requestBody: createEventRequestTemplate(schedule),
      sendUpdates: 'none', // 알림 발송 여부 선택
    });
    console.log('✅ 캘린더 이벤트 등록 성공:', res.data.htmlLink);
    return res.data.id; // 이벤트 ID (수정, 삭제를 위해 확보)
  } catch (err) {
    if (err instanceof Error) {
      console.error('❌ 캘린더 이벤트 등록 중 오류 발생:', err.message);
    }
    throw err;
  }
};

// 캘린더 이벤트 생성 요청 템플릿
const createEventRequestTemplate = (s: WingsSchedulesValues) => {
  const event = {
    summary: s.eventName,
    description: descriptionTemplate(s),
    location: s.place,
    colorId: (Math.floor(s.place.trim().length % 11) + 1).toString(), // 1 ~ 11 값으로 이벤트 색상 지정
    start: {
      dateTime: s.startTime,
      timeZone: 'Asia/Seoul',
    },
    end: {
      dateTime: s.endTime,
      timeZone: 'Asia/Seoul',
    },
    // UI에서 노출되지 않는 데이터
    extendedProperties: {
      shared: {
        manager: s.manager,
        place: s.place,
        type: s.type,
        status: s.status,
        eventNumber: s.eventNumber,
        eventRsvnNumber: s.eventRsvnNumber,
        detail: s.details.join('\n'),
      },
    },
  };

  return event;
};

// 캘린더 항목에 없는 내용은 세부내역 란에 정리해서 입력
const descriptionTemplate = (s: WingsSchedulesValues) => {
  const template = {
    담당자: s.manager,
    예약상태: s.status,
    행사타입: s.place,
    행사번호: s.eventNumber,
    참조사항: '\n' + s.details.join('\n'),
  };

  return Object.entries(template)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
};
