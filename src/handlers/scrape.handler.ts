import { scrapeOrchestrator } from '../orchestrator/scrapeOrchestrator';

// 서버리스 환경에서의 실행용
export const handler = async (event: IScrapeHandler) => {
  // TODO: 람다 등에서 현재 시각을 기준으로 이번달 + 다음달 설정이 가능하도록
  return scrapeOrchestrator(event.startDate, event.endDate);
};

interface IScrapeHandler {
  startDate: string;
  endDate: string;
}
