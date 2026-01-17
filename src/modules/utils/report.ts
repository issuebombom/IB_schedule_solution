import { LogLevel, LogPayload } from './logger';

type RunStatus = 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';

export type Step =
  | 'WINGS_LOGIN'
  | 'GET_WINGS_SCHEDULES'
  | 'GET_WINGS_SCHEDULE_DETAILS'
  | 'LOAD_CACHE_FROM_REDIS'
  | 'INIT_CACHE_CREATE'
  | 'UPDATE_SCHEDULES'
  | 'UPDATE_NEW_CALENDARS'
  | 'UPDATE_CHANGED_CALENDARS'
  | 'DIFF_EVENT_FIELD_VALUE';

type StepIssue = {
  level: LogLevel;
  payload: LogPayload;
};

type DetailOptions = {
  status?: 'OK' | 'FAILED';
  count?: number;
  [key: string]: unknown;
};

type OrchestratorReport = {
  id: string;
  range: { startDate: string; endDate: string };
  status: RunStatus;
  detail: Record<string, DetailOptions>;
  issues: StepIssue[];
  timingsMs: Record<string, number | null>;
};

export class ReportCollector {
  private report: OrchestratorReport;
  private stepStart = new Map<Step, number>();

  constructor(args: { startDate: string; endDate: string }) {
    this.report = {
      id: crypto.randomUUID(),
      range: { startDate: args.startDate, endDate: args.endDate },
      status: 'SUCCESS',
      detail: {},
      issues: [],
      timingsMs: {},
    };
  }

  addIssue(level: LogLevel, payload: LogPayload) {
    this.report.issues.push({ level, payload });
  }

  startStep(step: Step) {
    this.stepStart.set(step, Date.now());
  }

  endStep(step: Step) {
    const started = this.stepStart.get(step);
    if (!started) return;
    const ms = Date.now() - started;
    this.report.timingsMs[step] = ms;
    this.stepStart.delete(step);
  }

  addDetail(step: Step, options: DetailOptions) {
    this.report.detail[step] = {
      ...(this.report.detail[step] ?? {}),
      ...options,
    };
  }

  setStatus(status: RunStatus) {
    this.report.status = status;
  }

  build(): OrchestratorReport {
    return this.report;
  }

  async step<T>(stepName: Step, fn: () => T | Promise<T>): Promise<T> {
    this.startStep(stepName);
    try {
      const result = await fn();
      this.addDetail(stepName, { status: 'OK' });
      return result;
    } catch (err) {
      this.addDetail(stepName, { status: 'FAILED' });
      throw err; // orchestrator catch로 이동
    } finally {
      this.endStep(stepName); // 시간 측정
    }
  }
}
