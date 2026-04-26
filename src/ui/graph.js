import blessed from 'blessed';
import contrib from 'blessed-contrib';

const DEFAULT_GRAPH_COLOR = '#2bc4ff';
const calendarColorById = new Map();

export function setCalendarColorMap(calendars) {
  calendarColorById.clear();
  for (const calendar of calendars || []) {
    if (calendar && calendar.id) {
      calendarColorById.set(calendar.id, calendar.backgroundColor || null);
    }
  }
}

export function createGraph(screen) {
  const table = blessed.list({
    keys: true,
    fg: 'white',
    tags: true,
    selectedFg: 'green',
    interactive: true,
    label: 'Filled Time Graph',
    top: 0,
    left: '50%',
    width: '50%',
    height: '80%',
    padding: { left: 2, right: 5 },
    border: { type: 'line', fg: 'cyan' },
    columnSpacing: 2,
  });
  screen.append(table);

  return table;
}

export function insertDataToGraph(screen, table, eventsDataTimes, monday) {
  const timeColumnWidth = 5;
  const columnGap = ' ';
  const dayColumnWidth = 5;
  const dayLabels = [
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    '{blue-fg}Sat{/blue-fg}',
    '{red-fg}Sun{/red-fg}',
  ];
  const visibleLength = text => text.replace(/\{[^}]+\}/g, '').length;
  const padCell = (text, width) => {
    const padding = Math.max(width - visibleLength(text), 0);
    return `${text}${' '.repeat(padding)}`;
  };
  const centerCell = (text, width) => {
    const len = visibleLength(text);
    const leftPadding = Math.floor((width - len) / 2);
    const rightPadding = Math.max(width - len - leftPadding, 0);
    return `${' '.repeat(Math.max(leftPadding, 0))}${text}${' '.repeat(rightPadding)}`;
  };

  const normalizeDayTime = dayTime => {
    if (typeof dayTime === 'string') {
      return { time: dayTime, calendarId: null };
    }
    return {
      time: dayTime?.time || '',
      calendarId: dayTime?.calendarId || null,
    };
  };

  const parseRange = timeText => {
    const [startRaw, endRaw] = String(timeText || '').split('-');
    if (!startRaw) {
      return null;
    }
    const [startHourStr, startMinuteStr = '0'] = startRaw.split(':');
    const startHour = parseInt(startHourStr, 10);
    const startMinute = parseInt(startMinuteStr, 10);

    if (!Number.isInteger(startHour) || !Number.isInteger(startMinute)) {
      return null;
    }

    if (!endRaw) {
      const nextHour = Math.min(startHour + 1, 24);
      return {
        startHour,
        startMinute,
        endHour: nextHour,
        endMinute: startMinute,
      };
    }

    const [endHourStr, endMinuteStr = '0'] = endRaw.split(':');
    const endHour = parseInt(endHourStr, 10);
    const endMinute = parseInt(endMinuteStr, 10);
    if (!Number.isInteger(endHour) || !Number.isInteger(endMinute)) {
      return null;
    }

    return {
      startHour,
      startMinute,
      endHour,
      endMinute,
    };
  };

  const overlapsHour = (range, hour) => {
    if (!range) {
      return false;
    }
    return (
      hour >= range.startHour &&
      (hour < range.endHour || (hour === range.endHour && range.endMinute > 0))
    );
  };

  const resolveColor = normalized => {
    if (!normalized.calendarId) {
      return { color: DEFAULT_GRAPH_COLOR, resolved: false };
    }
    const color = calendarColorById.get(normalized.calendarId);
    if (!color) {
      return { color: DEFAULT_GRAPH_COLOR, resolved: false };
    }
    return { color, resolved: true };
  };

  const getOverlappingColors = (dayTimes, hour) => {
    const resolvedColors = [];
    const fallbackColors = [];

    for (const dayTime of dayTimes) {
      const normalized = normalizeDayTime(dayTime);
      if (!overlapsHour(parseRange(normalized.time), hour)) {
        continue;
      }

      const colorInfo = resolveColor(normalized);
      if (colorInfo.resolved) {
        resolvedColors.push(colorInfo.color);
      } else {
        fallbackColors.push(colorInfo.color);
      }
    }

    return [...resolvedColors, ...fallbackColors];
  };

  const filledCountMatrix = Array.from({ length: 24 }, (_, hour) =>
    Array.from({ length: 7 }, (_, day) => {
      const dayTimes = eventsDataTimes[day] || [];
      return Math.min(getOverlappingColors(dayTimes, hour).length, 2);
    })
  );

  const slotColorMatrix = Array.from({ length: 24 }, (_, hour) =>
    Array.from({ length: 7 }, (_, day) => {
      const dayTimes = eventsDataTimes[day] || [];
      return getOverlappingColors(dayTimes, hour);
    })
  );

  const blockCharForSlot = (hour, day, slot) => {
    const isFilled = filledCountMatrix[hour][day] > slot;
    if (!isFilled) {
      return '-';
    }
    const prevFilled = hour > 0 && filledCountMatrix[hour - 1][day] > slot;
    const nextFilled = hour < 23 && filledCountMatrix[hour + 1][day] > slot;
    const block = prevFilled || nextFilled ? '█' : '■';
    const colors = slotColorMatrix[hour][day] || [];
    const colorName = colors[slot] || colors[0] || DEFAULT_GRAPH_COLOR;
    return `{${colorName}-fg}${block}{/${colorName}-fg}`;
  };

  const blockChars = (hour, day) => {
    const firstSlot = blockCharForSlot(hour, day, 0);
    const secondSlot = blockCharForSlot(hour, day, 1);
    return `${firstSlot}${secondSlot}`;
  };

  const filledTime = [];
  for (let hour = 0; hour < 24; hour++) {
    const hourStart = hour < 10 ? `0${hour}` : `${hour}`;
    const hourEnd = hour + 1 < 10 ? `0${hour + 1}` : `${hour + 1}`;
    const timeSlot = `${hourStart}-${hourEnd}`;
    const weekData = [];

    for (let day = 0; day < 7; day++) {
      weekData.push(centerCell(blockChars(hour, day), dayColumnWidth));
    }
    filledTime.push(`${timeSlot.padEnd(timeColumnWidth)}${columnGap}${weekData.join(columnGap)}`);
  }

  const weekDates = Array.from(
    { length: 7 },
    (_, offset) => monday.addDays(offset).toLocalISOString().split('T')[0].split('-')[2]
  );
  const dayText = `${' '.repeat(timeColumnWidth)}${columnGap}${weekDates.map(date => padCell(date, dayColumnWidth)).join(columnGap)}`;
  const headers = `${'Time'.padEnd(timeColumnWidth)}${columnGap}${dayLabels.map(label => padCell(label, dayColumnWidth)).join(columnGap)}`;
  table.setItems([dayText, headers, ...filledTime]);

  screen.render();
}
