import axios from 'axios';
import { ENV } from '../../../env';
import puppeteer, { Cookie, Page } from 'puppeteer-core';
import { FatalError } from '../utils/appError';
import { log, LogLevel } from '../utils/logger';
import chromium from '@sparticuz/chromium';
import { Step } from '../utils/report';

export const wingsLogin = async () => {
  const step: Step = 'WINGS_LOGIN';
  let browser;
  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  try {
    browser = await puppeteer.launch({
      args: isLambda ? [...chromium.args, '--window-size=1280,720'] : ['--window-size=1280,720'],
      executablePath: isLambda
        ? await chromium.executablePath()
        : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      acceptInsecureCerts: true,
      defaultViewport: { width: 1280, height: 720 },
      headless: 'shell',
    });
    const page = await browser.newPage();
    await page.goto(ENV.WINGS_MAIN_URL, {
      waitUntil: 'networkidle2',
    });

    // ! LOG
    log(LogLevel.INFO, { step, message: '사이트 접속 성공' });

    // 셀렉터 타겟
    const companyIdSelector = '#company';
    const userIdSelector = '#username';
    const userPwSelector = "input[name='userpw']";
    const pwChangePopupSelector = '#popup_pw_change > .popup_form.input.ui-draggable';

    // 로그인 값 입력
    await page.type(companyIdSelector, ENV.WINGS_COMPANY_ID);
    await page.type(userIdSelector, ENV.WINGS_USER_ID);
    await page.type(userPwSelector, ENV.WINGS_USER_PW);

    // 엔터
    await page.keyboard.press('Enter');

    // 0.5초 대기
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 패스워드 변경 팝업 등장 유무 확인 (등장 시 스타일 포지션이 fixed로 변경됨)
    const popupPosition = await page
      .$eval(pwChangePopupSelector, (el) => getComputedStyle(el).position)
      .catch(() => 'relative');

    // 패스워드 변경 팝업 감지 시 임시 패스워드 변경
    if (popupPosition !== 'relative') {
      log(LogLevel.INFO, { step, message: '패스워드 변경 팝업 감지' });
      await popupPwChange(page);
      log(LogLevel.INFO, { step, message: '팝업 패스워드 변경 완료' });

      // 네트워크 요청 종료 시점까지 기다림
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 });
    }

    // ! LOG
    log(LogLevel.INFO, { step, message: '로그인 성공' });

    // 쿠키 획득
    const cookies = await browser.cookies();
    const sessionCookie = getSessionCookie(cookies);

    // ! LOG
    log(LogLevel.INFO, { step, message: '세션 쿠키 획득' });

    if (popupPosition !== 'relative') {
      // 팝업으로 비밀번호를 임시 변경했을 경우 원상복구
      const pwChangeResult = await pwChange(sessionCookie.value);

      // ! LOG
      log(LogLevel.INFO, { step, message: `비밀번호 재설정 완료 (${pwChangeResult.resultMsg})` });
    }

    return sessionCookie.value;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

const getSessionCookie = (cookies: Cookie[]) => {
  const sessionCookie = cookies.find((obj) => obj.name === 'JSESSIONID' && obj.path === '/pms');

  // 쿠키 없으면
  if (!sessionCookie) {
    throw new FatalError(
      'SESSION_COOKIE_ERROR',
      '세션 쿠키를 획득하지 못했습니다. 쿠키 획득 방식에 대한 점검이 필요합니다.',
    );
  }
  return sessionCookie;
};

const popupPwChange = async (page: Page) => {
  const nowPwSelector = '#now_pw';
  const newPwSelector = '#new_pw';
  const confirmPwSelector = '#new_pw_ok';
  const pwChangeButton = '#btn_pw_change';

  // 로그인 값 입력
  await page.type(nowPwSelector, ENV.WINGS_USER_PW);
  await page.type(newPwSelector, ENV.WINGS_TEMP_USER_PW);
  await page.type(confirmPwSelector, ENV.WINGS_TEMP_USER_PW);

  // Change 클릭 (바로 로그인 진행)
  await page.click(pwChangeButton);
};

const pwChange = async (sessionId: string) => {
  const data = {
    now_password: ENV.WINGS_TEMP_USER_PW,
    new_password: ENV.WINGS_USER_PW,
  };

  const res = await axios.post(ENV.WINGS_PW_CHANGE_URL, data, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8;',
      Cookie: `JSESSIONID=${sessionId};`,
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  const results = res.data;

  if (results.err) {
    throw new FatalError(
      'CHANGE_PASSWORD_ERROR',
      results.errMsg || '비밀번호 변경에 실패했습니다.',
    );
  }
  return results;
};
