import { Page, PuppeteerLifeCycleEvent } from 'puppeteer';

// 요청 함수에 대해 실패 시 재시도
export const requestRetry = async (func: Function, retries: number = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await func();
    } catch (err) {
      if (attempt === retries) {
        throw new Error(`Request failed after ${retries} attempts: ${err}`);
      }
      console.warn(`Request timeout (attempt ${attempt}). Retrying...`);

      // 짧은 딜레이 — 서버 반응 시간 확보
      await new Promise((r) => setTimeout(r, 500));
    }
  }
};

// 내비게이션 즉 페이지 변동이 완료될 시점까지 기다림 및 재시도
export const waitForNavigationWithRetry = async (
  page: Page,
  waitUntil: PuppeteerLifeCycleEvent = 'networkidle2',
  timeout: number = 5000,
  retries: number = 3,
) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await page.waitForNavigation({ waitUntil, timeout });
      return; // 성공하면 종료
    } catch (err) {
      if (attempt === retries) {
        throw new Error(`waitForNavigation failed after ${retries} attempts: ${err}`);
      }
      // 재시도 로그
      console.warn(`Navigation timeout (attempt ${attempt}). Retrying...`);

      // 짧은 딜레이 — 서버 반응 시간 확보
      await new Promise((r) => setTimeout(r, 500));
    }
  }
};
