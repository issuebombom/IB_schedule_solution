import { ParsedWingsSchedules, WingsSchedulesValues } from '../types/schedules.type';

// Map의 경우 key가 없으면 신규 등록, 있으면 덮어쓴다.
export const updateWingsSchedules = (
  eventNumbers: Set<string>,
  currSchedules: ParsedWingsSchedules,
) => {
  const updatedSchedules: ParsedWingsSchedules = new Map();
  eventNumbers.forEach((eNumber: string) => {
    const schedule = currSchedules.get(eNumber);
    if (schedule) {
      updatedSchedules.set(eNumber, schedule);
    }
  });
  // ! DEBUG
  console.log(`총 ${updatedSchedules.size}개의 스케줄을 업데이트했습니다.`);

  return updatedSchedules;
};

/**
 * 최신 스크랩 데이터와 캐시 데이터를 비교한다.
 * 스크랩 데이터가 캐시 데이터에 존재하지 않을 경우 신규 데이터로 본다
 * 스크랩 데이터가 캐시 데이터에 존재할 경우 변경 사항 유무를 체크한다.
 * 변경사항이 있을 경우
 */
export const compareWingsSchedules = (
  currSchedules: ParsedWingsSchedules,
  prevSchedules: ParsedWingsSchedules,
) => {
  // 캘린더 업데이트용
  const newEventNumbers: Set<string> = new Set();
  const diffEventNumbers: Set<string> = new Set();

  // 세부 변동 사항은 알림용을 보관
  const diffEventFieldValue: Record<string, string | string[]>[] = [];

  for (const [currKey, currValue] of currSchedules) {
    // 최신 이벤트 넘버를 예전 스케줄 Map에 대입
    const prevValue = prevSchedules.get(currKey);

    // 이벤트 넘버가 없는 경우 신규 스케줄로 처리
    if (!prevValue) {
      newEventNumbers.add(currKey);

      // 이벤트 넘버가 존재할 경우 변동사항 체크 시작
    } else {
      for (const field in currValue) {
        const fieldKey = field as keyof typeof currValue;
        if (prevValue[fieldKey] === currValue[fieldKey]) continue;
        // details은 배열이므로 무조건 false가 뜬다 | 문자열을 정확히 비교한다.
        if (fieldKey === 'details' && prevValue[fieldKey].join() === currValue[fieldKey].join())
          continue;

        // { 이벤트 넘버, 이벤트명, 필드, 기존값, 변동값 }
        diffEventFieldValue.push({
          eventNum: currKey,
          eventField: field,
          prevValue: prevValue[fieldKey],
          currVaule: currValue[fieldKey],
        });

        // 차이가 있는 이벤트 넘버 획득
        diffEventNumbers.add(currKey); // set
      }
    }
  }

  return { newEventNumbers, diffEventNumbers, diffEventFieldValue };
};
