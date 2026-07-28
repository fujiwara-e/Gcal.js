import { convertToDateTime } from '../utils/dateUtils.js';
import { updateEventsAndUI } from '../ui/tableUpdater.js';
import { searchDisplayItemIndex } from '../ui/displayItems.js';

function normalizeLabel(label) {
  return (label || '').replace(/\s*[↑↓](?:\s+\(.+\))?\s*$/, '');
}

function getFocusedRightEventTable(screen) {
  const focused = screen.focused;
  const focusedLabel = normalizeLabel(focused && focused.options && focused.options.label);
  const parentLabel = normalizeLabel(focused && focused.parent && focused.parent.options && focused.parent.options.label);

  if (focusedLabel === 'Last Year Events' || focusedLabel === 'Recent Events') {
    return focused;
  }

  if (parentLabel === 'Last Year Events' || parentLabel === 'Recent Events') {
    return focused.parent;
  }

  return null;
}

function searchDisplayItemIndexDesc(date, displayItems) {
  const searchDate = new Date(date);
  searchDate.setHours(0, 0, 0, 0);
  const searchDateKey = searchDate.toLocalISOString().slice(0, 10);

  for (let i = 0; i < displayItems.length; i++) {
    const itemDate = new Date(displayItems[i].date);
    itemDate.setHours(0, 0, 0, 0);
    const itemDateKey = itemDate.toLocalISOString().slice(0, 10);

    if (itemDateKey === searchDateKey) {
      return i;
    } else if (itemDate < searchDate) {
      return i;
    }
  }

  return displayItems.length > 0 ? displayItems.length - 1 : 0;
}

function getTargetDate(selectedDate, args) {
  if (args.length === 0) {
    return new Date();
  }

  const arg = args[0].toLowerCase();
  const targetDate = new Date(selectedDate);

  switch (arg) {
    case 'lw':
      targetDate.setDate(selectedDate.getDate() - 7);
      return targetDate;
    case 'lm':
      targetDate.setMonth(selectedDate.getMonth() - 1);
      return targetDate;
    case 'ly':
      targetDate.setFullYear(selectedDate.getFullYear() - 1);
      return targetDate;
    case 'nw':
      targetDate.setDate(selectedDate.getDate() + 7);
      return targetDate;
    case '2w':
      targetDate.setDate(selectedDate.getDate() + 14);
      return targetDate;
    case 'nm':
      targetDate.setMonth(selectedDate.getMonth() + 1);
      return targetDate;
    case 'ny':
      targetDate.setFullYear(selectedDate.getFullYear() + 1);
      return targetDate;
    default:
      return convertToDateTime(arg);
  }
}

function jumpFocusedRightEventTable(screen, args) {
  const rightEventTable = getFocusedRightEventTable(screen);
  if (!rightEventTable || rightEventTable.hidden || !rightEventTable.displayItems) {
    return false;
  }

  const index = rightEventTable.selected || 0;
  const selectedItem = rightEventTable.displayItems[index];
  const selectedDate = selectedItem ? new Date(selectedItem.date) : new Date();
  const targetDate = getTargetDate(selectedDate, args);

  if (isNaN(targetDate.getTime())) {
    const logTable = screen.children.find(child => child.options.label === 'Gcal.js Log');
    if (logTable) {
      logTable.log(`Invalid date: ${args[0]}`);
    }
    screen.render();
    return true;
  }

  const isDescending = rightEventTable.displayItems.length > 1 &&
    rightEventTable.displayItems[0].date > rightEventTable.displayItems[rightEventTable.displayItems.length - 1].date;
  const targetIndex = isDescending
    ? searchDisplayItemIndexDesc(targetDate, rightEventTable.displayItems)
    : searchDisplayItemIndex(targetDate, rightEventTable.displayItems);

  rightEventTable.select(targetIndex);
  rightEventTable.scrollTo(Math.max(0, targetIndex - Math.floor(rightEventTable.height / 2)));
  screen.render();
  return true;
}

export function jumpCommand(screen, events, allEvents, args, options = {}) {
  if (options.useFocusedRightEventTable && jumpFocusedRightEventTable(screen, args)) {
    return;
  }

  const leftTable = screen.children.find(child => child.options.label === 'Upcoming Events');
  const rightGraph = screen.children.find(child => child.options.label === 'Filled Time Graph');
  const logTable = screen.children.find(child => child.options.label === 'Gcal.js Log');
  const index = leftTable.selected || 0;

  let currentDate;
  if (leftTable.displayItems && leftTable.displayItems[index]) {
    currentDate = new Date(leftTable.displayItems[index].date);
  } else if (events[index]) {
    currentDate = new Date(events[index].start);
  } else {
    currentDate = new Date();
  }

  const selectedDate = currentDate;
  let targetDate;

  if (args.length === 0) {
    targetDate = new Date();
    updateEventsAndUI(
      screen,
      events,
      allEvents,
      leftTable,
      rightGraph,
      logTable,
      targetDate,
      index,
      'Jumped to today'
    );
    return;
  }

  const arg = args[0].toLowerCase();

  switch (arg) {
    case 'lw':
      targetDate = new Date(selectedDate);
      targetDate.setDate(selectedDate.getDate() - 7);
      updateEventsAndUI(
        screen,
        events,
        allEvents,
        leftTable,
        rightGraph,
        logTable,
        targetDate,
        index,
        'Jumped to last week'
      );
      break;
    case 'lm':
      targetDate = new Date(selectedDate);
      targetDate.setMonth(selectedDate.getMonth() - 1);
      updateEventsAndUI(
        screen,
        events,
        allEvents,
        leftTable,
        rightGraph,
        logTable,
        targetDate,
        index,
        'Jumped to last month'
      );
      break;
    case 'ly':
      targetDate = new Date(selectedDate);
      targetDate.setFullYear(selectedDate.getFullYear() - 1);
      updateEventsAndUI(
        screen,
        events,
        allEvents,
        leftTable,
        rightGraph,
        logTable,
        targetDate,
        index,
        'Jumped to last year'
      );
      break;
    case 'nw':
      targetDate = new Date(selectedDate);
      targetDate.setDate(selectedDate.getDate() + 7);
      updateEventsAndUI(
        screen,
        events,
        allEvents,
        leftTable,
        rightGraph,
        logTable,
        targetDate,
        index,
        'Jumped to next week'
      );
      break;
    case '2w':
      targetDate = new Date(selectedDate);
      targetDate.setDate(selectedDate.getDate() + 14);
      updateEventsAndUI(
        screen,
        events,
        allEvents,
        leftTable,
        rightGraph,
        logTable,
        targetDate,
        index,
        'Jumped to 2 weeks later'
      );
      break;
    case 'nm':
      targetDate = new Date(selectedDate);
      targetDate.setMonth(selectedDate.getMonth() + 1);
      updateEventsAndUI(
        screen,
        events,
        allEvents,
        leftTable,
        rightGraph,
        logTable,
        targetDate,
        index,
        'Jumped to next month'
      );
      break;
    case 'ny':
      targetDate = new Date(selectedDate);
      targetDate.setFullYear(selectedDate.getFullYear() + 1);
      updateEventsAndUI(
        screen,
        events,
        allEvents,
        leftTable,
        rightGraph,
        logTable,
        targetDate,
        index,
        'Jumped to next year'
      );
      break;
    default:
      targetDate = convertToDateTime(arg);
      if (isNaN(targetDate.getTime())) {
        logTable.log(`Invalid date: ${args[0]}`);
        screen.render();
        return;
      }
      updateEventsAndUI(
        screen,
        events,
        allEvents,
        leftTable,
        rightGraph,
        logTable,
        targetDate,
        index,
        `Jumped to ${targetDate}`
      );
      break;
  }
}
