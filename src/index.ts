import { scrapeOrchestrator } from './orchestrator/scrapeOrchestrator';
import 'dotenv/config';

// 로컬 테스트 실행용
const startDate = '202506';
const endDate = '202507';

// run
(async () => {
  const result = await scrapeOrchestrator(startDate, endDate);
  console.log(result);
})();
