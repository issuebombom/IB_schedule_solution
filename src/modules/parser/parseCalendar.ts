import { ParsedBatchResponse, ParsedGoogleCalendar } from '../types/calendar.type';

// 구글 캘린더 배치 이벤트 요청 후 응답 데이터(TEXT)에 대한 파싱
export const parseBatchGoogleResponse = (raw: string) => {
  const parsedData: Map<string, BatchGoogleResponse> = new Map();

  // boundary block 단위로 분리
  const parts = raw.split(/--batch_[A-Za-z0-9]+/g);

  for (const part of parts) {
    if (!part.includes('Content-ID')) continue;

    // 1) Content-ID 숫자 추출
    const idMatch = part.match(/Content-ID:\s*<response-item\d+:\s*(\d+)>/);
    // 2) 응답 상태 번호
    const httpStatus = part.match(/HTTP\/\d\.\d\s+(\d{3})/);
    // 3) JSON 본문 추출
    const jsonMatch = part.match(/\{[\s\S]*\}/);

    if (
      idMatch &&
      typeof idMatch[1] === 'string' &&
      httpStatus &&
      typeof httpStatus[1] === 'string'
    ) {
      const responseBody = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      parsedData.set(idMatch[1], { httpStatus: httpStatus[1], responseBody });
    }
  }

  return parsedData;
};

// 구글 배치 응답 결과를 캐시 캘린더 형태로 파싱 (응답 body가 있을 때만 사용할 것)
export const parseGoogleCalendar = (batchGoogleResponse: Map<string, BatchGoogleResponse>) => {
  const parsedData: ParsedGoogleCalendar = new Map();
  for (const [key, value] of batchGoogleResponse) {
    if (value.responseBody) {
      parsedData.set(key, value.responseBody);
    }
  }
  return parsedData;
};

type BatchGoogleResponse = {
  httpStatus: string;
  responseBody: ParsedBatchResponse;
};
