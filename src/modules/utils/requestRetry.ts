import { Page, PuppeteerLifeCycleEvent, TimeoutError } from 'puppeteer-core';
import { FatalError, RequestTimeoutError } from './appError';
import { log, LogLevel } from './logger';

// 요청 함수에 대해 실패 시 재시도
export const requestRetry = async <T>(func: () => Promise<T>, retries: number = 3) => {
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
  throw new FatalError(
    'REQUEST_RETRY_ERROR',
    '요청 재시도 중 원인을 알 수 없는 에러가 발생했습니다.',
  );
};
