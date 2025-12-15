import 'dotenv/config';
import { ENV } from '../../../env';
import puppeteer, { Browser, TimeoutError } from 'puppeteer';

export const wingsLogin = async () => {
  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        'window-size=1920,1080',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
    const page = await browser.newPage();
    await page.goto(ENV.WINGS_MAIN_URL, {
      waitUntil: 'networkidle2',
    });

    // 셀렉터 타겟
    const companyIdSelector = '#company';
    const userIdSelector = '#username';
    const userPwSelector = "input[name='userpw']";
    const pwChangePopupSelector = '#popup_pw_change';

    // 로그인 값 입력
    Promise.all([
      await page.type(companyIdSelector, ENV.WINGS_COMPANY_ID),
      await page.type(userIdSelector, ENV.WINGS_USER_ID),
      await page.type(userPwSelector, ENV.WINGS_USER_PW),
    ]);

    // 엔터 후 쿠키 예상 획득 시점까지 기다림
    await Promise.all([
      // 엔터
      page.keyboard.press('Enter'),
      // 내비게이션(DOM 완성 시점까지) 기다림
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }),
      // 해당 응답을 받을 때까지 기다림
      page.waitForResponse((res) => res.url().includes('pms/samlsso.do') && res.status() === 200, {
        timeout: 5000,
      }),
    ]);

    // 패스워드 변경 팝업 등장 시
    const isPopupChangePw = (await page.$(pwChangePopupSelector)) !== null;
    if (isPopupChangePw) {
      // TODO: 추후 에러 던지지 말고, 해당 팝업을 끄는 방향으로 로직 수정
      throw new Error('비밀번호 변경 팝업으로 인해 스크랩 진행 불가');
    }

    const cookies = await browser.cookies();
    const sessionCookie = cookies.find((obj) => obj.name === 'JSESSIONID' && obj.path === '/pms');

    // 쿠키 없으면
    if (!sessionCookie) {
      throw new Error('세션 쿠키를 획득하지 못했습니다.');
    }

    return sessionCookie.value;
  } catch (error) {
    if (error instanceof TimeoutError) {
      console.error('로그인 타임아웃 에러 발생');
    } else {
      // 에러 로깅 필요 (슬랙 등)
      console.error('로그인 중 예상치 못한 오류 발생');
    }
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};
