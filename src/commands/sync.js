import { updateTable } from '../ui/tableUpdater.js';
import { mergeDuplicateEvents } from '../services/databaseService.js';
import { loadSetting } from '../services/settingService.js';

export async function syncCommand(auth, screen, calendars, events, allEvents, keypressListener) {
  const leftTable = screen.children.find(child => child.options.label === 'Upcoming Events');
  const logTable = screen.children.find(child => child.options.label === 'Gcal.js Log');
  leftTable.on('keypress', keypressListener);
  try {
    await updateTable(auth, leftTable, calendars, events, allEvents);
    await mergeDuplicateEvents();
    logTable.log(loadSetting().tasksEnabled
      ? 'Synced with Google Calendar and Tasks!'
      : 'Synced with Google Calendar!');
  } catch (_err) {
    logTable.log('Error: Failed to sync.');
  }
  screen.render();
}
