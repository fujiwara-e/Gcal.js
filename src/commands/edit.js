import { google } from 'googleapis';
import { updateTable } from '../ui/tableUpdater.js';
import { groupEventsByDate, formatGroupedEventsDescending } from '../ui/displayFormatter.js';
import { createAddForm } from '../ui/form.js';
import { updateEventDetailTable } from '../ui/table.js';
import path from 'path';
import os from 'os';
import {
  applyDetailsToForm,
  collectFormValues,
  formatEventDate,
  eventToFormValues,
  buildCalendarEventResource,
  validateFormValues,
  openEditorAndParse,
  setupEditorShortcut,
  setupSaveShortcut,
  setupEscapeShortcut,
} from '../utils/eventFormUtils.js';

export function editEvent(
  auth,
  screen,
  calendars,
  selectedEvent,
  events,
  allEvents,
  selectedDate = null,
  copyTargetDate = null
) {
  const calendar = google.calendar({ version: 'v3', auth });
  const calendarList = screen.children.find(child => child.options.label === 'Calendar List');
  const leftTable = screen.children.find(child => child.options.label === 'Upcoming Events');
  const logTable = screen.children.find(child => child.options.label === 'Gcal.js Log');
  const eventTable = screen.children.find(child => child.options.label === 'Current Events');
  const editCommandList = screen.children.find(child => child.options.label === 'Edit List');
  const eventDetailTable = screen.children.find(child => child.options.label === 'Event Details');
  const { formBox, formFields } = createAddForm(screen);
  const tempFilePath = path.join(os.tmpdir(), 'blessed-editor.txt');
  const selectedCalendarId = selectedEvent?.calendarId ?? null;
  const selectedEventsId = selectedEvent?.id ?? null;
  const fallbackDate = selectedEvent?.start || selectedDate || new Date();
  const fallbackDateInfo = formatEventDate(fallbackDate);
  const calendarNames = Array.from(new Set(calendars.map(calendar => calendar.summary)));
  const calendarIDs = Array.from(new Set(calendars.map(calendar => calendar.id)));

  updateEventDetailTable(eventDetailTable, selectedEvent);
  eventDetailTable.show();

  const showValidationError = () => {
    logTable.log('Error: All fields must be filled in.');
    screen.render();
  };

  const finalizeSuccess = async message => {
    await updateTable(auth, leftTable, calendars, events, allEvents);
    logTable.log(message);
    if (!formBox.destroyed) {
      formBox.destroy();
    }
    screen.render();
    leftTable.focus();
    screen.render();
  };

  async function prepareForm({
    label,
    initialValues,
    includeAllDay = false,
    openEditorImmediately = false,
  }) {
    formBox.setLabel(label);
    applyDetailsToForm(formFields, initialValues, { includeAllDay });
    formBox.show();
    formBox.focus();
    screen.render();

    setupEditorShortcut({
      formBox,
      formFields,
      screen,
      tempFilePath,
      options: { includeAllDay },
    });

    setupEscapeShortcut({
      formBox,
      leftTable,
      logTable,
      screen,
    });

    if (openEditorImmediately) {
      const updatedValues = await openEditorAndParse(screen, tempFilePath, initialValues, {
        includeAllDay,
      });

      if (updatedValues) {
        applyDetailsToForm(formFields, updatedValues, { includeAllDay });
        screen.render();
      }
    }
  }

  editCommandList.show();
  screen.render();
  editCommandList.focus();
  editCommandList.once('select', async (item, index) => {
    eventDetailTable.hide();

    const promptCalendarSelection = handler => {
      editCommandList.hide();
      calendarList.show();
      calendarList.focus();
      screen.render();

      calendarList.once('select', async (calendarItem, calendarIndex) => {
        const selectedEditCalendar = calendarNames[calendarIndex];
        const selectedEditCalendarId = calendarIDs[calendarIndex];

        calendarList.hide();
        screen.render();

        if (!selectedEditCalendar || !selectedEditCalendarId) {
          logTable.log('Error: Invalid calendar selection.');
          screen.render();
          editCommandList.show();
          editCommandList.focus();
          screen.render();
          return;
        }

        await handler(selectedEditCalendar, selectedEditCalendarId);
      });
    };

    switch (index) {
      case 0:
        promptCalendarSelection(async (selectedEditCalendar, selectedEditCalendarId) => {
          const baseValues = eventToFormValues(selectedEvent, fallbackDate);
          const initialValues = {
            ...baseValues,
            title: '',
            description: '',
            allDay: false,
          };

          await prepareForm({
            label: `Edit Event - ${selectedEditCalendar}  (Ctrl+S to save)`,
            initialValues,
            includeAllDay: true,
            openEditorImmediately: true,
          });

          setupSaveShortcut({
            formBox,
            formFields,
            options: { includeAllDay: true },
            handler: async values => {
              if (!validateFormValues(values)) {
                showValidationError();
                return;
              }

              const eventResource = buildCalendarEventResource(values);

              calendar.events.insert(
                {
                  calendarId: selectedEditCalendarId,
                  resource: eventResource,
                },
                async err => {
                  if (err) {
                    console.error('The API returned an error: ' + err);
                    logTable.log('Error: Failed to register event.');
                    screen.render();
                    return;
                  }

                  await finalizeSuccess('Event successfully registered!');
                }
              );
            },
          });
        });
        break;

      case 1:
        promptCalendarSelection(async (selectedEditCalendar, selectedEditCalendarId) => {
          if (!selectedEvent || !selectedCalendarId || !selectedEventsId) {
            logTable.log('Error: No event selected to move.');
            screen.render();
            return;
          }

          const initialValues = eventToFormValues(selectedEvent, fallbackDate);

          await prepareForm({
            label: `Edit Event - ${selectedEditCalendar}`,
            initialValues,
            openEditorImmediately: true,
          });

          setupSaveShortcut({
            formBox,
            formFields,
            options: {},
            handler: async values => {
              if (!validateFormValues(values)) {
                showValidationError();
                return;
              }

              const eventResource = buildCalendarEventResource(values);

              calendar.events.delete(
                {
                  calendarId: selectedCalendarId,
                  eventId: selectedEventsId,
                },
                err => {
                  if (err) {
                    console.error('The API returned an error: ' + err);
                    logTable.log('Error: Failed to delete original event.');
                    screen.render();
                    return;
                  }

                  calendar.events.insert(
                    {
                      calendarId: selectedEditCalendarId,
                      resource: eventResource,
                    },
                    async insertErr => {
                      if (insertErr) {
                        console.error('The API returned an error: ' + insertErr);
                        logTable.log('Error: Failed to move event.');
                        screen.render();
                        return;
                      }

                      await finalizeSuccess('Event successfully moved!');
                    }
                  );
                }
              );
            },
          });
        });
        break;

      case 2:
        promptCalendarSelection(async (selectedEditCalendar, selectedEditCalendarId) => {
          const initialValues = eventToFormValues(selectedEvent, fallbackDate);
          if (copyTargetDate) {
            const targetDateInfo = formatEventDate(copyTargetDate);
            if (targetDateInfo?.date) {
              initialValues.date = targetDateInfo.date;
            }
          }

          await prepareForm({
            label: `Edit Event - ${selectedEditCalendar}`,
            initialValues,
            openEditorImmediately: true,
          });

          setupSaveShortcut({
            formBox,
            formFields,
            options: {},
            handler: async values => {
              if (!validateFormValues(values)) {
                showValidationError();
                return;
              }

              const eventResource = buildCalendarEventResource(values);

              calendar.events.insert(
                {
                  calendarId: selectedEditCalendarId,
                  resource: eventResource,
                },
                async err => {
                  if (err) {
                    console.error('The API returned an error: ' + err);
                    logTable.log('Error: Failed to register event.');
                    screen.render();
                    return;
                  }

                  await finalizeSuccess('Event successfully registered!');
                }
              );
            },
          });
        });
        break;

      case 3:
        editCommandList.hide();
        if (!selectedEvent || !selectedCalendarId || !selectedEventsId) {
          logTable.log('Error: No event selected to delete.');
          screen.render();
          leftTable.focus();
          screen.render();
          return;
        }
        calendar.events.delete(
          {
            calendarId: selectedCalendarId,
            eventId: selectedEventsId,
          },
          async err => {
            if (err) {
              console.error('The API returned an error: ' + err);
              logTable.log('Error: Failed to delete event.');
              screen.render();
              return;
            }

            await finalizeSuccess('Event successfully deleted!');
          }
        );
        break;

      case 4: {
        screen.append(eventTable);
        eventTable.show();
        editCommandList.hide();

        const currentEvents = formatGroupedEventsDescending(events);
        eventTable.setItems(currentEvents);

        eventTable.focus();
        screen.render();

        const now = new Date();
        now.setHours(23, 59, 59, 99);
        const groupedEvents = groupEventsByDate(events);

        const filteredGroupedEvents = Object.entries(groupedEvents)
          .filter(([_, eventList]) => {
            return eventList.some(event => new Date(event.start) <= now);
          })
          .sort(([dateA], [dateB]) => new Date(dateB) - new Date(dateA));

        const descSortedEvents = filteredGroupedEvents.flatMap(([, list]) => list.flat());

        eventTable.once('select', async (tableItem, eventIndex) => {
          eventTable.hide();
          const originEvent = descSortedEvents[eventIndex];

          if (!originEvent) {
            logTable.log('Error: Selected event could not be found.');
            screen.render();
            return;
          }

          const selectedEditCalendar = originEvent.calendarName;
          const selectedEditCalendarId = originEvent.calendarId;
          const initialValues = eventToFormValues(originEvent);
          if (fallbackDateInfo?.date) {
            initialValues.date = fallbackDateInfo.date;
          }

          await prepareForm({
            label: `Edit Event - ${selectedEditCalendar}`,
            initialValues,
            openEditorImmediately: true,
          });

          setupSaveShortcut({
            formBox,
            formFields,
            options: {},
            handler: async values => {
              if (!validateFormValues(values)) {
                showValidationError();
                return;
              }

              const eventResource = buildCalendarEventResource(values);

              calendar.events.insert(
                {
                  calendarId: selectedEditCalendarId,
                  resource: eventResource,
                },
                async err => {
                  if (err) {
                    console.error('The API returned an error: ' + err);
                    logTable.log('Error: Failed to register event.');
                    screen.render();
                    return;
                  }

                  await finalizeSuccess('Event successfully registered!');
                }
              );
            },
          });
        });
        break;
      }

      default:
        break;
    }
  });

  editCommandList.key(['escape'], () => {
    editCommandList.hide();
    eventDetailTable.hide();
    leftTable.focus();
    screen.render();
  });
}

/**
 * 去年の予定テーブルから選択したイベントを targetDate の日付にコピーするフロー
 * カレンダ選択 → フォーム（ソースイベントの内容を日付だけ targetDate に変更してプリフィル）→ 保存
 */
export async function copyEventToDate(
  auth,
  screen,
  calendars,
  sourceEvent,
  targetDate,
  events,
  allEvents
) {
  const calendar = google.calendar({ version: 'v3', auth });
  const calendarList = screen.children.find(child => child.options.label === 'Calendar List');
  const leftTable = screen.children.find(child => child.options.label === 'Upcoming Events');
  const logTable = screen.children.find(child => child.options.label === 'Gcal.js Log');
  const { formBox, formFields } = createAddForm(screen);
  const tempFilePath = path.join(os.tmpdir(), 'blessed-editor.txt');

  const calendarNames = Array.from(new Set(calendars.map(cal => cal.summary)));
  const calendarIDs = Array.from(new Set(calendars.map(cal => cal.id)));

  const showValidationError = () => {
    logTable.log('Error: All fields must be filled in.');
    screen.render();
  };

  const finalizeSuccess = async message => {
    await updateTable(auth, leftTable, calendars, events, allEvents);
    logTable.log(message);
    if (!formBox.destroyed) {
      formBox.destroy();
    }
    screen.render();
    leftTable.focus();
    screen.render();
  };

  const baseValues = eventToFormValues(sourceEvent);
  const targetDateInfo = formatEventDate(targetDate);
  const initialValues = {
    ...baseValues,
    date: targetDateInfo?.date || baseValues.date,
  };

  calendarList.show();
  screen.render();
  calendarList.focus();

  calendarList.once('select', async (item, index) => {
    const selectedCalendar = calendarNames[index];
    const selectedCalendarId = calendarIDs[index];
    calendarList.hide();
    screen.render();

    formBox.setLabel(
      `Copy Event to ${targetDateInfo?.date || ''} - ${selectedCalendar}  (Ctrl+S to save)`
    );
    applyDetailsToForm(formFields, initialValues, {});
    formBox.show();
    formBox.focus();
    screen.render();

    setupEditorShortcut({ formBox, formFields, screen, tempFilePath, options: {} });

    const updatedValues = await openEditorAndParse(screen, tempFilePath, initialValues, {});
    if (updatedValues) {
      applyDetailsToForm(formFields, updatedValues, {});
      screen.render();
    }

    setupEscapeShortcut({ formBox, leftTable, logTable, screen });

    setupSaveShortcut({
      formBox,
      formFields,
      options: {},
      handler: async values => {
        if (!validateFormValues(values)) {
          showValidationError();
          return;
        }

        const eventResource = buildCalendarEventResource(values);

        calendar.events.insert(
          { calendarId: selectedCalendarId, resource: eventResource },
          async err => {
            if (err) {
              console.error('The API returned an error: ' + err);
              logTable.log('Error: Failed to register event.');
              screen.render();
              return;
            }
            await finalizeSuccess('Event successfully copied!');
          }
        );
      },
    });
  });

  calendarList.key(['escape'], () => {
    calendarList.hide();
    leftTable.focus();
    screen.render();
    logTable.log('Copy cancelled.');
  });
}
