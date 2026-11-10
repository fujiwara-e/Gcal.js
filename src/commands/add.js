import { createCalendarClient } from '../services/googleApi.js';
import { updateTable } from '../ui/tableUpdater.js';
import { createAddForm } from '../ui/form.js';
import { waitForListSelection } from '../ui/listSelection.js';
import path from 'path';
import os from 'os';
import fs from 'fs';
import {
  applyDetailsToForm,
  buildCalendarEventResource,
  collectFormValues,
  formatEventDate,
  openEditorAndParse,
  validateFormValues,
} from '../utils/eventFormUtils.js';

export function addEvent(
  auth,
  screen,
  calendars,
  events,
  allEvents,
  { returnToCommandLine = false } = {}
) {
  const activeForm = screen.children.find(
    child => child.options.formType === 'event' && child.options.reuse === false
  );
  if (activeForm) {
    activeForm.focus();
    screen.render();
    return;
  }

  const calendarList = screen.children.find(child => child.options.label === 'Calendar List');
  const calendarNames = Array.from(new Set(calendars.map(calendar => calendar.summary)));
  const calendarIDs = Array.from(new Set(calendars.map(calendar => calendar.id)));

  calendarList.show();
  calendarList.focus();
  screen.render();

  const selectCalendar = (_item, index) => {
    calendarList.hide();
    openAddForm(auth, screen, calendars, events, allEvents, calendarNames[index], calendarIDs[index]);
  };
  const cancelCalendarSelection = () => {
    calendarList.hide();
    if (returnToCommandLine) {
      const inputBox = screen.children.find(child => child.options.label === 'Commandline');
      inputBox.setValue('add ');
      inputBox.show();
      inputBox.focus();
    } else {
      const leftTable = screen.children.find(child => child.options.label === 'Upcoming Events');
      leftTable.focus();
    }
    screen.render();
  };
  waitForListSelection(calendarList, selectCalendar, cancelCalendarSelection);
}

function openAddForm(auth, screen, calendars, events, allEvents, selectedCalendar, selectedCalendarId) {
  const calendar = createCalendarClient({ version: 'v3', auth });
  const leftTable = screen.children.find(child => child.options.label === 'Upcoming Events');
  const logTable = screen.children.find(child => child.options.label === 'Gcal.js Log');
  const { formBox, formFields } = createAddForm(screen, { reuse: false });
  const options = { includeAllDay: true };
  let editing = false;
  let saving = false;

  const today = new Date();
  today.setMinutes(0, 0, 0);
  const { date, time } = formatEventDate(today);
  applyDetailsToForm(formFields, { date, startTime: time, endTime: time }, options);
  formBox.setLabel(`Add Event - ${selectedCalendar}  (Ctrl+S to save)`);

  function closeForm() {
    leftTable.focus();
    // Blessed unregisters a widget from input handling when it is detached.
    for (const field of Object.values(formFields)) field.destroy();
    formBox.destroy();
    screen.render();
  }

  async function editDraft() {
    if (editing || saving || formBox.destroyed) return;
    editing = true;
    let directory;
    try {
      directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gcal-add-'));
      const values = collectFormValues(formFields, options);
      const updatedValues = await openEditorAndParse(
        screen, path.join(directory, 'event.txt'), values, options
      );
      if (updatedValues && !formBox.destroyed) {
        applyDetailsToForm(formFields, updatedValues, options);
        screen.render();
      }
    } catch (err) {
      logTable.log(`Error: Failed to edit event draft: ${err.message}`);
      screen.render();
    } finally {
      editing = false;
      if (directory) fs.rmSync(directory, { recursive: true, force: true });
    }
  }

  async function save() {
    if (editing || saving || formBox.destroyed) return;
    const values = collectFormValues(formFields, options);
    if (!validateFormValues(values)) {
      logTable.log('Error: All fields must be filled in.');
      screen.render();
      return;
    }

    saving = true;
    try {
      await calendar.events.insert({
        calendarId: selectedCalendarId,
        resource: buildCalendarEventResource(values),
      });
    } catch (err) {
      saving = false;
      logTable.log(`Error: Failed to register event: ${err.message}`);
      screen.render();
      return;
    }

    try {
      await updateTable(auth, leftTable, calendars, events, allEvents);
      logTable.log('Event successfully registered!');
    } catch {
      logTable.log('Error: Event saved, but failed to refresh the display. Run sync.');
    }
    closeForm();
  }

  formBox.key(['enter'], editDraft);
  formBox.key(['escape'], () => {
    if (saving) return;
    logTable.log('Add event cancelled.');
    closeForm();
  });
  formBox.key(['C-s'], save);
  formBox.on('element key C-s', field => {
    if (field !== formBox) return save();
  });

  formBox.show();
  formBox.focus();
  screen.render();
  void editDraft();
}
