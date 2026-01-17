import axios from 'axios';
import { format } from 'date-fns';
import { ParsedWingsSchedules, WingsSchedulesValues } from '../../types/schedules.type';
import { ParsedGoogleCalendar } from '../../types/calendar.type';

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

  newEventMessage(
    newEventNumbers: Set<string>,
    currSchedules: ParsedWingsSchedules,
    newCalendars: ParsedGoogleCalendar,
  ) {
    const events: WingsSchedulesValues[] = [];
    newEventNumbers.forEach((eNumber: string) => {
      const schedule = currSchedules.get(eNumber);
      // 취소 설정된 신규 일정은 캘린더 등록 안함
      if (schedule && schedule.status !== 'CXL') {
        events.push(schedule);
      }
    });

    const subject = `:pushpin:  총 ${events.length}건의 새로운 행사가 등록되었습니다.\n`;
    const message = events.reduce((prevMsg, event: WingsSchedulesValues) => {
      let msg = '';
      const startTime = format(new Date(event.startTime), 'MM/dd EEE HH:mm');
      const endTime = format(new Date(event.endTime), 'MM/dd EEE HH:mm');
      const details = this.replaceArrayToString(event.details);
      const link = newCalendars.get(event.eventNumber)?.htmlLink;

      msg += `_*${event.eventName}*_ [${startTime}]\n`;
      msg += `> 장소: ${event.place}\n`;
      msg += `> 행사날짜:\n`;
      msg += `> ${startTime} ~ ${endTime}\n`;
      msg += `> 담당자: ${event.manager}\n`;
      msg += `> 참조사항:\n`;
      msg += `> ${this.shorten(details)}\n`;
      msg += `> <${link}|자세히>`;

      return prevMsg + msg;
    }, '');

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

  private replaceArrayToString(arr: string[]) {
    let contents = '없음';
    if (arr.length > 0) {
      contents = arr.map((v) => v.replace(/\n/g, ' ')).join('');
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
