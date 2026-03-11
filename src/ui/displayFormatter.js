/**
 * displayItems やイベントをテーブル表示用文字列に整形する関数群
 */
import { getDayOfWeek } from '../utils/dateUtils.js';
import pkg from 'japanese-holidays';
const { isHoliday } = pkg;

function colorDate(dateKey, color) {
  if (color === 'blue') {
    return `{blue-fg}${dateKey}{/blue-fg}`;
  } else if (color === 'red') {
    return `{red-fg}${dateKey}{/red-fg}`;
  }
  return dateKey;
}

export function groupEventsByDate(events) {
  return events.reduce((grouped, event) => {
    var dateKey = event.start.toLocalISOString().split('T')[0];
    var year = Number(event.start.toLocalISOString().split('-')[0]);
    var month = Number(event.start.toLocalISOString().split('-')[1]);
    var day = parseInt(event.start.toLocalISOString().split('-')[2], 10);
    dateKey = dateKey + '(' + getDayOfWeek(year, month, day) + ')';
    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(event);
    return grouped;
  }, {});
}

/**
 * displayItems配列からテーブル表示用の文字列配列を生成
 */
export function formatDisplayItems(displayItems) {
  const formattedData = [];
  let beforeDateKey = null;

  displayItems.forEach(item => {
    const { date, event, isFirstDay } = item;
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfWeek = getDayOfWeek(year, month, day);
    const dateKey = date.toLocalISOString().split('T')[0] + '(' + dayOfWeek + ')';

    if (!event) {
      let coloredDate = dateKey;
      const dayNum = date.getDay();
      if (dayNum === 6) {
        coloredDate = colorDate(dateKey, 'blue');
      } else if (dayNum === 0 || isHoliday(date)) {
        coloredDate = colorDate(dateKey, 'red');
      } else {
        coloredDate = colorDate(dateKey, 'normal');
      }
      formattedData.push(`${coloredDate}`);
      beforeDateKey = dateKey;
      return;
    }

    const startTime = event.start.toTimeString().slice(0, 5);
    const endTime = event.end ? event.end.toTimeString().slice(0, 5) : '';
    const time = endTime ? `${startTime}-${endTime}` : startTime;
    const summary = event.summary;
    const calendarName = `[${event.calendarName}]`;
    let coloredDate = dateKey;

    if (dateKey === beforeDateKey) {
      coloredDate = ''.padEnd(dateKey.length);
    } else {
      const dayNum = date.getDay();
      if (dayNum === 6) {
        coloredDate = colorDate(dateKey, 'blue');
      } else if (dayNum === 0 || isHoliday(date)) {
        coloredDate = colorDate(dateKey, 'red');
      } else {
        coloredDate = colorDate(dateKey, 'normal');
      }
    }

    beforeDateKey = dateKey;

    if (time === '00:00-00:00') {
      formattedData.push(`${coloredDate}`);
    } else if (startTime === endTime) {
      formattedData.push(`${coloredDate}  終日         ${summary}  ${calendarName}`);
    } else {
      formattedData.push(`${coloredDate}  ${time}  ${summary}  ${calendarName}`);
    }
  });

  return formattedData;
}

export function formatGroupedEventsDescending(events) {
  const now = new Date();
  now.setHours(23, 59, 59, 99);
  const groupedEvents = groupEventsByDate(events);

  const filteredGroupedEvents = Object.entries(groupedEvents)
    .filter(([_, eventList]) => {
      return eventList.some(event => new Date(event.start) < now);
    })
    .sort(([dateA], [dateB]) => new Date(dateB) - new Date(dateA));

  const formattedData = [];
  let beforeDateKey = null;

  filteredGroupedEvents.forEach(([dateKey, events]) => {
    events.forEach(event => {
      const startTime = event.start.toTimeString().slice(0, 5);
      const endTime = event.end ? event.end.toTimeString().slice(0, 5) : '';
      const time = endTime ? `${startTime}-${endTime}` : startTime;
      const summary = event.summary;
      const calendarName = `[${event.calendarName}]`;
      let coloredDate = dateKey;

      if (dateKey === beforeDateKey) {
        coloredDate = ''.padEnd(dateKey.length);
      } else {
        const date = new Date(event.start);
        const day = date.getDay();
        if (day === 6) {
          coloredDate = colorDate(dateKey, 'blue');
        } else if (day === 0 || isHoliday(date)) {
          coloredDate = colorDate(dateKey, 'red');
        } else {
          coloredDate = colorDate(dateKey, 'normal');
        }
      }

      beforeDateKey = dateKey;

      if (time === '00:00-00:00') {
        formattedData.push(`${coloredDate}`);
      } else if (startTime === endTime) {
        formattedData.push(`${coloredDate}  終日         ${summary}  ${calendarName}`);
      } else {
        formattedData.push(`${coloredDate}  ${time}  ${summary}  ${calendarName}`);
      }
    });
  });

  return formattedData;
}
