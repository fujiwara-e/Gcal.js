import blessed from 'blessed';
import {
  configCalendarListInDatabase,
  fetchCalendarsFromDatabase,
} from '../services/databaseService.js';
import { refreshCalendarList } from '../services/calendarService.js';
import { updateTable, updateEventsAndUI, updateGraph } from '../ui/tableUpdater.js';
import { setCalendarColorMap } from '../ui/graph.js';

export async function configCommand(auth, screen, calendars, events, allEvents) {
  const leftTable = screen.children.find(child => child.options.label === 'Upcoming Events');
  const calendarList = screen.children.find(child => child.options.label === 'Calendar List');
  const logTable = screen.children.find(child => child.options.label === 'Gcal.js Log');
  const rightGraph = screen.children.find(child => child.options.label === 'Filled Time Graph');
  const targetDate = leftTable.displayItems?.[leftTable.selected]?.date || new Date();

  async function reloadCalendars() {
    const selectedCalendars = await fetchCalendarsFromDatabase();
    calendars.splice(0, calendars.length, ...selectedCalendars);
    calendarList.setItems(calendars.map(calendar => calendar.summary));
    setCalendarColorMap(calendars);

    const byId = new Map(calendars.map(calendar => [calendar.id, calendar]));
    const visibleItems = allEvents.filter(item => {
      if (item.isTask && item.isTask()) return true;
      const calendar = byId.get(item.calendarId);
      if (!calendar) return false;
      item.calendarName = calendar.summary;
      return true;
    });
    allEvents.splice(0, allEvents.length, ...visibleItems);
  }

  let allCalendars;
  logTable.log('Refreshing calendar list...');
  screen.render();
  try {
    allCalendars = await refreshCalendarList(auth);
    await reloadCalendars();
    updateEventsAndUI(
      screen, events, allEvents, leftTable, rightGraph, logTable,
      targetDate, leftTable.selected, 'Calendar list refreshed.'
    );
  } catch (_err) {
    logTable.log('Error: Failed to refresh calendar list.');
    leftTable.focus();
    screen.render();
    return;
  }

  const form = blessed.form({
    parent: screen,
    label: 'Select Calendars to Display (Ctrl+S to save)',
    top: 'center',
    left: 'center',
    width: '70%',
    height: '50%',
    keys: true,
    border: { type: 'line' },
    scrollable: true,
    alwaysScroll: true,
    hidden: true,
    style: {
      border: { fg: 'cyan' },
      scrollbar: { bg: 'white' },
    },
    vi: true,
  });

  const selectedCalendarIds = new Set(calendars.map(calendar => calendar.id));
  const checkboxes = allCalendars.map((calendar, index) => {
    const checkbox = blessed.checkbox({
      parent: form,
      top: index,
      left: 2,
      height: 1,
      content: calendar.summary,
      checked: selectedCalendarIds.has(calendar.id),
      mouse: true,
      keys: true,
      style: { fg: 'white', focus: { bg: 'blue', bold: true } },
    });
    checkbox.on('focus', () => {
      const scrollOffset = form.childBase + form.height - 1;
      if (index < form.childBase) {
        form.scrollTo(index);
      } else if (index >= scrollOffset) {
        form.scrollTo(index - form.height + 2);
      }
      screen.render();
    });
    return { checkbox, id: calendar.id };
  });

  let saving = false;
  const save = async () => {
    if (saving) return;
    saving = true;
    form.hide();
    screen.render();
    try {
      const selectedIds = checkboxes.filter(item => item.checkbox.checked).map(item => item.id);
      await configCalendarListInDatabase(selectedIds);
      await reloadCalendars();
      await updateTable(auth, leftTable, calendars, events, allEvents);
      updateGraph(screen, rightGraph, leftTable.selected, events, leftTable.displayItems);
      logTable.log('Config successfully registered!');
      form.destroy();
      leftTable.focus();
    } catch (_err) {
      logTable.log('Error: Failed to save calendar selection.');
      form.show();
      (checkboxes[0]?.checkbox || form).focus();
    } finally {
      saving = false;
      screen.render();
    }
  };

  form.key(['C-s'], save);
  for (const { checkbox } of checkboxes) checkbox.key(['C-s'], save);
  form.key(['escape'], () => {
    if (saving) return;
    form.destroy();
    leftTable.focus();
    screen.render();
  });
  form.show();
  (checkboxes[0]?.checkbox || form).focus();
  screen.render();
}
