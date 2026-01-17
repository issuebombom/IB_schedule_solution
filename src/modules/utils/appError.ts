export type ErrorContext = Record<string, unknown>;

export class AppError extends Error {
  readonly id: string;
  readonly timestamp: Date;
  readonly name: string;
  readonly context?: ErrorContext;
  readonly cause?: unknown;

  constructor(name: string, message: string, context?: ErrorContext, cause?: unknown) {
    super(message);
    this.id = genId(12);
    this.timestamp = new Date();
    this.name = name;
    this.context = context ?? {};
    this.cause = cause;
  }
}

export class RequestTimeoutError extends AppError {}
export class FatalError extends AppError {}

const genId = (length = 16): string => {
  const p = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return [...Array(length)].reduce((a) => a + p[Math.floor(Math.random() * p.length)], '');
};
