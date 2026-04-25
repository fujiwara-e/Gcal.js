/**
 * テーブル・グラフの更新ロジック
 */
import { fetchEvents } from '../services/calendarService.js';
import {
  insertEventsToDatabase,
  fetchEventsFromDatabase,
  replaceTasksInDatabase,
  fetchTasksFromDatabase,
} from '../services/databaseService.js';
import { fetchTasks } from '../services/taskService.js';
import { getDayOfWeek } from '../utils/dateUtils.js';
import { createDisplayItems, searchDisplayItemIndex } from './displayItems.js';
import { groupEventsByDate, formatDisplayItems } from './displayFormatter.js';
import { insertDataToGraph } from './graph.js';
import { filterDisplayableItems, sortItemsByStart } from '../utils/itemUtils.js';
import { showTaskSetupNotice } from '../utils/taskNotice.js';

/**
 * グラフを更新（新しいdisplayItems構造に対応）
 * displayItemsが利用可能な場合はそれを使用し、なければ後方互換性のためeventsを使用
 */
export function updateGraph(screen, rightGraph, index, events, displayItems = null) {
  let currentEventDate;

  if (displayItems && displayItems[index]) {
    // 新しいdisplayItems構造を使用
    currentEventDate = new Date(displayItems[index].date);
  } else if (events && events[index]) {
    // 後方互換性のため、旧方式もサポート
    currentEventDate = new Date(events[index].start);
  } else {
    // どちらも利用できない場合は今日の日付を使用
    currentEventDate = new Date();
  }

  const monday = new Date(currentEventDate);
  const currentDayOfWeek = monday.getDay();
  const offsetToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
  monday.setDate(monday.getDate() + offsetToMonday);

  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const tempDate = new Date(monday);
    tempDate.setDate(monday.getDate() + i);
    weekDates.push(tempDate.toLocalISOString().split('T')[0]);
  }

  const filledTime = [];
  const groupedEvents = groupEventsByDate(events);
  weekDates.forEach(dateKey => {
    const year = Number(dateKey.split('-')[0]);
    const month = Number(dateKey.split('-')[1]);
    const day = parseInt(dateKey.split('-')[2], 10);
    const dayOfWeek = getDayOfWeek(year, month, day);
    const formattedDateKey = dateKey + '(' + dayOfWeek + ')';

    const dayEvents = groupedEvents[formattedDateKey] || [];
    const dayTimes = dayEvents.map(event => {
      const startTime = event.start.toTimeString().slice(0, 5);
      const endTime = event.end ? event.end.toTimeString().slice(0, 5) : '';
      return endTime ? `${startTime}-${endTime}` : startTime;
    });

    filledTime.push(dayTimes);
  });
  insertDataToGraph(screen, rightGraph, filledTime, monday);
}

export async function updateTable(auth, table, calendars, events, allEvents) {
  const newEvents = await fetchEvents(auth, calendars);
  let newTasks = null;
  try {
    newTasks = await fetchTasks(auth);
  } catch (_err) {
    const logTable = table.screen.children.find(child => child.options.label === 'Gcal.js Log');
    showTaskSetupNotice(logTable);
  }
  await insertEventsToDatabase(newEvents);
  if (newTasks) {
    await replaceTasksInDatabase(newTasks);
  }
  allEvents.length = 0;
  const fetchedEvent = await fetchEventsFromDatabase(calendars);
  const fetchedTasks = await fetchTasksFromDatabase();
  allEvents.push(...sortItemsByStart([...fetchedEvent, ...fetchedTasks.filter(task => task.due)]));
  events.length = 0;
  events.push(...filterDisplayableItems([...allEvents], new Date()));
  sortItemsByStart(events);

  const displayItems = createDisplayItems(events, new Date());
  const formattedEvents = formatDisplayItems(displayItems);
  table.displayItems = displayItems;
  table.setItems(formattedEvents);
  table.select(searchDisplayItemIndex(new Date(), displayItems));
  table.scrollTo(table.selected + table.height - 3);
  table.screen.render();
}

export function updateEventsAndUI(
  screen,
  events,
  allEvents,
  leftTable,
  rightGraph,
  logTable,
  targetDate,
  index,
  message
) {
  events.length = 0;
  events.push(...filterDisplayableItems([...allEvents], targetDate));
  sortItemsByStart(events);

  const displayItems = createDisplayItems(events, targetDate);
  const formattedEvents = formatDisplayItems(displayItems);
  leftTable.displayItems = displayItems;
  leftTable.setItems(formattedEvents);
  index = searchDisplayItemIndex(targetDate, displayItems);
  leftTable.select(index);
  leftTable.scrollTo(leftTable.selected + leftTable.height - 3);
  updateGraph(screen, rightGraph, index, events, displayItems);
  logTable.log(message);
  screen.render();
}
