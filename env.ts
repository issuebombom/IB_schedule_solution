import { z } from 'zod';

// 1. 환경 변수 스키마 정의 (z.object)
const envSchema = z.object({
  WINGS_MAIN_URL: z.string().min(1),
  WINGS_COMPANY_ID: z.string().min(1),
  WINGS_USER_ID: z.string().min(1),
  WINGS_USER_PW: z.string().min(1),
  WINGS_SCHEDULE_URL: z.string().min(1),
  WINGS_SCHEDULE_DETAILS_URL: z.string().min(1),

  SNAPSHOT_DIR: z.string().min(1),
});

// 2. process.env 검증 및 결과 객체 생성
// 환경 변수가 스키마를 만족하지 못하면 에러 발생
export const ENV = (() => {
  try {
    return envSchema.parse(process.env);
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.error(err.message);
    }
    throw err;
  }
})();
