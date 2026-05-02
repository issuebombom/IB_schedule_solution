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

// place와 event colorId를 매칭해주는 JSON 리턴 타입
export type PlaceColorIdMap = Record<string, string | number>; 
