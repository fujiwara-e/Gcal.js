/**
 * displayItems やイベントをテーブル表示用文字列に整形する関数群
 */
import { getDayOfWeek } from '../utils/dateUtils.js';
import pkg from 'japanese-holidays';
const { isHoliday } = pkg;

function colorDate(dateKey, color) {
  if (color === 'blue') {
    return `{blue-fg}${dateKey}{/blue-fg}`;
  }
  if (color === 'red') {
    return `{red-fg}${dateKey}{/red-fg}`;
  }
  return dateKey;
}

function isTaskItem(event) {
  return Boolean(event?.isTask && event.isTask());
}

function isCompletedTask(event) {
  return isTaskItem(event) && Boolean(event.isCompleted && event.isCompleted());
}

function buildDateKey(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${date.toLocalISOString().split('T')[0]}(${getDayOfWeek(year, month, day)})`;
}

function getColoredDateKey(dateKey, date, beforeDateKey) {
  if (dateKey === beforeDateKey) {
    return ''.padEnd(dateKey.length);
  }

  const dayNum = date.getDay();
  if (dayNum === 6) {
    return colorDate(dateKey, 'blue');
  }
  if (dayNum === 0 || isHoliday(date)) {
    return colorDate(dateKey, 'red');
  }
  return colorDate(dateKey, 'normal');
}

function formatItemLabel(event) {
  if (!event?.itemType || event.itemType === 'event' || isTaskItem(event)) {
    return '';
  }

  const label = event.getDisplayType ? event.getDisplayType() : event.itemType;
  return `{yellow-fg}[${label}]{/yellow-fg} `;
}

function shouldRenderDateOnly(event, time) {
  return !isTaskItem(event) && time === '00:00-00:00';
}

function formatTimeLabel(event, startTime, endTime) {
  if (isTaskItem(event)) {
    return isCompletedTask(event)
      ? '{green-fg}[Done]{/green-fg}'
      : '{yellow-fg}[ToDo]{/yellow-fg}';
  }

  if (startTime === endTime) {
    return '終日';
  }

  return `${startTime}-${endTime}`;
}

function renderFormattedRow(event, dateKey, date, beforeDateKey) {
  const startTime = event.start.toTimeString().slice(0, 5);
  const endTime = event.end ? event.end.toTimeString().slice(0, 5) : '';
  const time = endTime ? `${startTime}-${endTime}` : startTime;
  const coloredDate = getColoredDateKey(dateKey, date, beforeDateKey);

  if (shouldRenderDateOnly(event, time)) {
    return `${coloredDate}`;
  }

  const timeLabel = formatTimeLabel(event, startTime, endTime);
  const summary = `${formatItemLabel(event)}${event.summary}`;
  const calendarName = `[${event.calendarName}]`;
  return `${coloredDate}  ${timeLabel.padEnd(13)} ${summary}  ${calendarName}`;
}

export function groupEventsByDate(events) {
  return events.reduce((grouped, event) => {
    const dateKey = buildDateKey(event.start);
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
    const { date, event } = item;
    const dateKey = buildDateKey(date);

    if (!event) {
      formattedData.push(getColoredDateKey(dateKey, date, beforeDateKey));
      beforeDateKey = dateKey;
      return;
    }

    formattedData.push(renderFormattedRow(event, dateKey, date, beforeDateKey));
    beforeDateKey = dateKey;
  });

  return formattedData;
}

export function formatGroupedEventsDescending(events) {
  const now = new Date();
  now.setHours(23, 59, 59, 99);
  const groupedEvents = groupEventsByDate(events);

  const filteredGroupedEvents = Object.entries(groupedEvents)
    .filter(([_, eventList]) => eventList.some(event => new Date(event.start) < now))
    .sort(([dateA], [dateB]) => new Date(dateB) - new Date(dateA));

  const formattedData = [];
  let beforeDateKey = null;

  filteredGroupedEvents.forEach(([dateKey, eventsForDate]) => {
    eventsForDate.forEach(event => {
      const date = new Date(event.start);
      formattedData.push(renderFormattedRow(event, dateKey, date, beforeDateKey));
      beforeDateKey = dateKey;
    });
  });

  return formattedData;
}
