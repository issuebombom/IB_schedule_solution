export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogPayload {
  step: string;
  message: string;
  context?: Record<string, unknown>;
  error?: unknown;
}

export const log = (level: LogLevel, payload: LogPayload) => {
  const base = {
    level,
    timestamp: new Date().toISOString(),
    step: payload.step,
    message: payload.message,
  };

  if (level === LogLevel.INFO) {
    console.info(base.message);
  } else if (level === LogLevel.ERROR) {
    console.error({ ...base, ...payload });
  } else {
    console.log({ ...base, ...payload });
  }
};
