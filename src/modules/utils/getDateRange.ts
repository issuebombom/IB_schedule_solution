import { addMonths, format } from 'date-fns';

/**
 * 연월 범위를 지정하면 해당 범위를 배열로 나열
 * @param startDate
 * @param endDate
 * @returns
 */
export const getMonthsRange = (startDate: string, endDate: string) => {
  const result = [];
  let [year, month] = divmod(parseInt(startDate), 100);
  while (true) {
    const currDate = year * 100 + month;
    result.push(currDate.toString());
    if (currDate === parseInt(endDate)) {
      break;
    }

    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return result;
};

export const getStartEndDate = (startDate: Date, months: number = 1) => {
  const startYearMonth = format(startDate, 'yyyyMM');
  const endYearMonth = format(addMonths(startDate, months), 'yyyyMM');
  return { startYearMonth, endYearMonth };
};

function divmod(a: number, b: number): [number, number] {
  const quotient = Math.floor(a / b);
  const remainder = a % b;
  return [quotient, remainder];
}
