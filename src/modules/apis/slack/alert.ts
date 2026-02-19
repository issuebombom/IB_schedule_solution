import axios from 'axios';
import { format } from 'date-fns';
import { DiffEventFieldValue } from '../../types/schedules.type';
import { ParsedBatchResponse, ParsedGoogleCalendar } from '../../types/calendar.type';

export class SlackAlert {
  private token;
  private channelId;

  constructor(channelId: string, token: string) {
    this.token = token;
    this.channelId = channelId;
  }

  async sendMessage(subject: string, message: string): Promise<void> {
    const url = 'https://slack.com/api/chat.postMessage';
    const headers = {
      Authorization: 'Bearer ' + this.token,
      'Content-type': 'application/json',
    };
    const messageForm = this.basicForm(subject, message);
    await axios.post(url, messageForm, { headers });
  }

  newEventMessage(newEventNumbers: Set<string>, newCalendars: ParsedGoogleCalendar) {
    const events: ParsedBatchResponse[] = [];
    newEventNumbers.forEach((eNumber: string) => {
      const schedule = newCalendars.get(eNumber);
      if (schedule) {
        events.push(schedule);
      }
    });

    const subject = `:pushpin:  총 ${events.length}건의 새로운 행사가 등록되었습니다.\n`;
    const message = events.reduce((prevMsg, event: ParsedBatchResponse) => {
      const property = event.extendedProperties.shared;
      let msg = '';
      const startTime = format(new Date(property.startTime), 'MM/dd EEE HH:mm');
      const endTime = format(new Date(property.endTime), 'MM/dd EEE HH:mm');
      const detail = property.detail || '없음';
      const link = event.htmlLink;

      msg += `_*${property.eventName}*_ [${startTime}]\n`;
      msg += `> 장소: ${property.place}\n`;
      msg += `> 행사날짜:\n`;
      msg += `> ${startTime} ~ ${endTime}\n`;
      msg += `> 담당자: ${property.manager}\n`;
      msg += `> 참조사항:\n`;
      msg += `> ${this.shorten(detail)}\n`;
      msg += `> <${link}|자세히>\n`;

      return prevMsg + msg;
    }, '');

    return { subject, message };
  }

  changedEventMessage(events: DiffEventFieldValue[]) {
    const nameMatch = {
      eventNumber: '행사번호',
      eventName: ':bookmark:  행사명',
      manager: ':man_in_tuxedo:  매니저',
      startTime: ':alarm_clock:  시작 날짜',
      endTime: ':alarm_clock:  종료 날짜',
      place: ':house:  장소',
      status: ':white_check_mark:  예약 상태',
      details: ':notebook:  참조 사항',
    };

    /**
     * 하나의 행사 내에서도 복수의 필드값이 변경되었을 수 있다.
     * 이 경우는 하나의 행사가 내용 변경된 것으로 취급해야 한다.
     * */
    const changedCount = new Set(events.map((e) => e.eventNumber)).size; // 중복 행사 제외
    const subject = `:dizzy:  총 ${changedCount}건의 행사 정보가 변경되었습니다.\n`;

    let recentEventNumber = '';
    const message = events.reduce((prevMsg, event: DiffEventFieldValue) => {
      let msg = '';

      // 전처리
      const startTime = format(new Date(event.startTime), 'MM/dd EEE HH:mm');
      const changedFieldName = nameMatch[event.eventField as keyof typeof nameMatch];
      const prevValue = Array.isArray(event.prevValue)
        ? this.replaceArrayToString(event.prevValue)
        : event.prevValue;
      const currValue = Array.isArray(event.currValue)
        ? this.replaceArrayToString(event.currValue)
        : event.currValue;

      // 동일 행사에 여러 변경 항목이 있을 경우 1타이틀 + n 변경사항으로 알림 내용 작성
      const title =
        recentEventNumber !== event.eventNumber
          ? `_*${event.eventName}*_ [${startTime}] \`${event.place}\`\n`
          : '';

      msg += `> ${changedFieldName}\n`;
      msg += `> \`변경 전\`  ${prevValue}\n`;
      msg += `> \`변경 후\`  ${currValue}\n`;

      recentEventNumber = event.eventNumber;

      return prevMsg + title + msg;
    }, '');

    return { subject, message };
  }

  errorMessage(step: string, errMessage: string, stack?: string) {
    const subject = `${step}가 발생했습니다.`;
    const message = `${errMessage}\ntraceback:\n${stack}`;

    return { subject, message };
  }

  private basicForm(subject: string, message: string) {
    return {
      channel: this.channelId,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: subject } },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `:robot_face:  *Updated at* ${new Date()}`,
            },
          ],
        },
        { type: 'divider' },
        { type: 'section', text: { type: 'mrkdwn', text: message } },
        { type: 'divider' },
      ],
    };
  }

  // 참조 사항은 배열 타입이므로 문자열로 변경한다.
  private replaceArrayToString(arr: string[]) {
    let contents = '참조사항 없음';
    if (arr.length > 0) {
      contents = arr.map((v) => v.replace(/\n/g, ' ')).join(' ');
    }
    return contents;
  }

  // 지정된 길이를 초과하는 문자열은 잘라낸 후 placeholder로 대체한다. (ex. 이것은...(생략))
  private shorten(text: string, width: number = 50, placeholder: string = '...(생략)'): string {
    if (text.length > width) {
      return text.slice(0, width) + placeholder;
    }
    return text;
  }
}
