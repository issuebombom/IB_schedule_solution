import 'dotenv/config';
import { scrapeOrchestrator } from './orchestrator/scrapeOrchestrator';
import { getStartEndDate } from './modules/utils/getDateRange';
import { validateYearMonthRange } from './modules/utils/validator';

// 로컬 테스트 실행용
const event = {
  startYearMonth: '202601',
  endYearMonth: '202602',
};

// run
(async () => {
  let report;
  const isValid = validateYearMonthRange(event);

  if (isValid) {
    report = await scrapeOrchestrator(event.startYearMonth, event.endYearMonth);
  } else {
    const { startYearMonth, endYearMonth } = getStartEndDate(new Date(), 1);
    report = await scrapeOrchestrator(startYearMonth, endYearMonth);
  }
  console.dir(report, { depth: null });
})();
