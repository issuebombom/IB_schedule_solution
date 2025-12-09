import { ParsedWingsSchedules } from '../types/schedules.type';

export const updateWingsSchedules = () => {};

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
