import blessed from 'blessed';
import contrib from 'blessed-contrib';

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
  const dayColumnWidth = 3;
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
    const leftPadding = Math.floor((width - text.length) / 2);
    const rightPadding = Math.max(width - text.length - leftPadding, 0);
    return `${' '.repeat(Math.max(leftPadding, 0))}${text}${' '.repeat(rightPadding)}`;
  };

  const filledTime = [];
  for (let hour = 0; hour < 24; hour++) {
    const hourStart = hour < 10 ? `0${hour}` : `${hour}`;
    const hourEnd = hour + 1 < 10 ? `0${hour + 1}` : `${hour + 1}`;
    const timeSlot = `${hourStart}-${hourEnd}`;
    const weekData = [];

    for (let day = 0; day < 7; day++) {
      const dayTimes = eventsDataTimes[day] || [];
      const isFilled = dayTimes.some(eventTime => {
        const [start, end] = eventTime.split('-');
        const startHour = parseInt(start.split(':')[0], 10);
        const endHour = parseInt(end.split(':')[0], 10);
        const endMinute = parseInt(end.split(':')[1], 10);
        return hour >= startHour && (hour < endHour || (hour === endHour && endMinute > 0));
      });
      weekData.push(centerCell(isFilled ? '■' : '-', dayColumnWidth));
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
