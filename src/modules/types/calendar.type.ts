export type ParsedBatchResponse = {
  kind?: string;
  id?: string;
  status?: string;
  htmlLink?: string;
  extendedProperties?: {
    shared: Record<string, number | string | number[] | string[]>;
  };
  [k: string]: any;
};

export type ParsedGoogleCalendar = Map<string, ParsedBatchResponse>;
