export type ParsedBatchResponse = {
  kind?: string;
  id?: string;
  status?: string;
  htmlLink?: string;
  [k: string]: any;
};

export type ParsedGoogleCalendar = Map<string, ParsedBatchResponse>;
