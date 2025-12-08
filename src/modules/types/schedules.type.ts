import z from 'zod';

// scrape type
export const getWingsSchedulesSchema = z.object({
  startDate: z.string().length(6),
  endDate: z.string().length(6),
  sessionId: z.string().min(1),
});
export type GetWingsSchedules = z.infer<typeof getWingsSchedulesSchema>;

export type GetWingsScheduleDetails = {
  schedules: ParsedWingsSchedules;
  sessionId: string;
};

export type GetWingsScrapeResult = {
  rows: WingsSchedules | WingsScheduleDetails;
  resultCd: string;
  resultMsg: string;
  PMS_URL: string;
  BWI_URL: string;
  BOS_URL: string;
  API_URL: string;
};

export const wingsSchedulesSchema = z.array(
  z.object({
    DEF_PAX: z.number(),
    RSVN_TYPE: z.string(),
    EVENT_DATE: z.string(),
    FNC_NAME: z.string(),
    FNC_ROOM_NAME: z.string(),
    QUOT_DEGREE: z.string().nullable(),
    EVENT_START_TIME: z.string(),
    FNC_RSVN_NO: z.string(),
    MENU_LIST: z.string().nullable(),
    EVENT_TIME: z.string(),
    FNC_STATUS_CODE: z.string(),
    FNC_TYPE_NAME: z.string(),
    MENU_TYPE_NAME: z.string(),
    SALE_MANAGER: z.string(),
    FNC_NAME_ORG: z.string(),
    EVENT_NO: z.string(),
    REMARK: z.string().nullable(),
    BSNS_CODE: z.string(),
  }),
);
export type WingsSchedules = z.infer<typeof wingsSchedulesSchema>;

export const wingsScheduleDetailsSchema = z.array(z.object({ TEXT: z.string() }));
export type WingsScheduleDetails = z.infer<typeof wingsScheduleDetailsSchema>;

export const parsedWingsSchedulesSchema = z.map(
  z.number(),
  z.object({
    eventName: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    place: z.string(),
    type: z.string(),
    status: z.string(),
    manager: z.string(),
    eventNumber: z.string(),
    eventRsvnNumber: z.string(),
    details: z.array(z.string()),
  }),
);

export type ParsedWingsSchedules = z.infer<typeof parsedWingsSchedulesSchema>;
