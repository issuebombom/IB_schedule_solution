import { getStartEndDate } from '../modules/utils/getDateRange';
import { validateYearMonthRange } from '../modules/utils/validator';
import { scrapeOrchestrator } from '../orchestrator/scrapeOrchestrator';

// 서버리스 환경에서의 실행용
export const handler = async (event: IScrapeHandler) => {
  let report;
  // 파라미터 입력값이 있을 경우 validation
  const isValid = validateYearMonthRange(event);
  if (isValid) {
    report = await scrapeOrchestrator(event.startYearMonth, event.endYearMonth);
  } else {
    // 디폴트 실행
    const { startYearMonth, endYearMonth } = getStartEndDate(new Date(), 1);
    report = await scrapeOrchestrator(startYearMonth, endYearMonth);
  }

  console.dir(report, { depth: null });
  return report;
};

interface IScrapeHandler {
  startYearMonth: string;
  endYearMonth: string;
}
