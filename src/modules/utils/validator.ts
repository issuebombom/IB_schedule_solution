import { ValidationError } from './appError';
import { log, LogLevel } from './logger';

export function validateYearMonthRange(event: any): boolean {
  if (!event?.startYearMonth || !event?.endYearMonth) {
    log(LogLevel.INFO, {
      step: 'CHECK_EVENT_PARAMETER',
      message: `입력된 파라미터가 없어 기본 설정값으로 실행합니다.`,
    });
    return false;
  }

  const { startYearMonth, endYearMonth } = event;

  if (typeof startYearMonth !== 'string' || typeof endYearMonth !== 'string') {
    throw new ValidationError('YearMonth 값은 문자열이어야 합니다.');
  }

  const ymRegex = /^\d{6}$/;

  if (!ymRegex.test(startYearMonth) || !ymRegex.test(endYearMonth)) {
    throw new ValidationError('YearMonth 형식은 YYYYMM(6자리 숫자)이어야 합니다.');
  }

  const parseYearMonth = (ym: string) => {
    const year = Number(ym.slice(0, 4));
    const month = Number(ym.slice(4, 6));

    if (month < 1 || month > 12) {
      throw new ValidationError(`잘못된 월 값입니다: ${ym}`);
    }

    return { year, month };
  };

  const start = parseYearMonth(startYearMonth);
  const end = parseYearMonth(endYearMonth);

  // 숫자 비교용 변환
  const startValue = start.year * 100 + start.month;
  const endValue = end.year * 100 + end.month;

  if (startValue > endValue) {
    throw new ValidationError('startYearMonth는 endYearMonth보다 클 수 없습니다.');
  }

  return true;
}
