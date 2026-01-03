import { Page, PuppeteerLifeCycleEvent, TimeoutError } from 'puppeteer';
import { RequestTimeoutError } from './appError';
import { log, LogLevel } from './logger';

// 요청 함수에 대해 실패 시 재시도
export const requestRetry = async (func: Function, retries: number = 3) => {
  const step = 'REQUEST_RETRY';
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await func();
    } catch (err) {
      if (err instanceof TimeoutError) {
        // 최대 시도 횟수에 도달한 경우
        if (attempt === retries) {
          throw new RequestTimeoutError(
            'REQUEST_TIMEOUT_ERROR',
            `Request failed after ${retries} attempts: ${attempt}`,
            { name: func.name, retries },
            err,
          );
        }
        log(LogLevel.WARN, {
          step,
          message: `Request ${func.name} function timeout (attempt ${attempt}). Retrying...`,
        });

        // 짧은 딜레이 — 서버 반응 시간 확보
        await new Promise((r) => setTimeout(r, 500));
      } else {
        throw err;
      }
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
