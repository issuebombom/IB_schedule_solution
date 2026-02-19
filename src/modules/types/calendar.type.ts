export type ParsedBatchResponse = {
  kind: string;
  id: string;
  status: string;
  htmlLink: string;
  extendedProperties: {
    shared: {
      eventName: string;
      startTime: string;
      endTime: string;
      manager: string;
      place: string;
      type: string;
      status: string;
      eventNumber: string;
      eventRsvnNumber: string;
      detail: string;
    };
  };
  [k: string]: any;
};

export type ParsedGoogleCalendar = Map<string, ParsedBatchResponse>;
