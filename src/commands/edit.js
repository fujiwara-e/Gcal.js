import { createCalendarClient } from '../services/googleApi.js';
import { updateTable } from '../ui/tableUpdater.js';
import { groupEventsByDate, formatGroupedEventsDescending } from '../ui/displayFormatter.js';
import { createAddForm, createTaskForm } from '../ui/form.js';
import { updateEventDetailTable } from '../ui/table.js';
import { waitForListSelection } from '../ui/listSelection.js';
import { setCalendarChoices } from '../ui/calendarChoices.js';
import {
  fetchTaskLists,
  createTask,
  toggleTaskCompletion,
  deleteTask,
} from '../services/taskService.js';
import path from 'path';
import os from 'os';
import { loadSetting } from '../services/settingService.js';
import { openExternalEditor, parseEditorFields } from '../utils/editor.js';
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

const TASK_ENTER_HANDLER_KEY = Symbol('taskEnterHandler');
const TASK_SAVE_HANDLER_KEY = Symbol('taskSaveHandler');
const TASK_ESCAPE_HANDLER_KEY = Symbol('taskEscapeHandler');

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
  const tasksEnabled = loadSetting().tasksEnabled;
  const editActions = [
    { action: 'addEvent', label: '選択日にイベントを追加' },
    ...(tasksEnabled ? [{ action: 'addTask', label: '選択日にタスクを追加' }] : []),
    { action: 'editEvent', label: 'イベントを編集' },
    { action: 'copyEvent', label: 'イベントをコピー' },
    { action: 'deleteEvent', label: 'イベントを削除' },
    { action: 'copyOtherEvent', label: '他のイベントを参照して選択日にコピー' },
  ];
  const defaultEditItems = editActions.map(item => item.label);
  const taskEditItems = ['Task の完了状態を切り替え', 'Task を削除'];
  const calendar = createCalendarClient({ version: 'v3', auth });
  const calendarList = screen.children.find(child => child.options.label === 'Calendar List');
  const leftTable = screen.children.find(child => child.options.label === 'Upcoming Events');
  const logTable = screen.children.find(child => child.options.label === 'Gcal.js Log');
  if (!tasksEnabled && selectedEvent?.isTask && selectedEvent.isTask()) {
    logTable.log('Google Tasks is disabled. Set tasksEnabled to true in setting.json and restart.');
    screen.render();
    return;
  }
  const eventTable = screen.children.find(child => child.options.label === 'Current Events');
  const editCommandList = screen.children.find(child => child.options.label === 'Edit List');
  const eventDetailTable = screen.children.find(child => child.options.label === 'Event Details');
  const { formBox, formFields } = createAddForm(screen);
  const { formBox: taskFormBox, formFields: taskFormFields } = tasksEnabled
    ? createTaskForm(screen)
    : { formBox: null, formFields: null };
  const tempFilePath = path.join(os.tmpdir(), 'blessed-editor.txt');
  const taskTempFilePath = path.join(os.tmpdir(), 'blessed-task-editor.txt');
  const selectedCalendarId = selectedEvent?.calendarId ?? null;
  const selectedEventsId = selectedEvent?.id ?? null;
  const fallbackDate = selectedEvent?.start || selectedDate || new Date();
  const fallbackDateInfo = formatEventDate(fallbackDate);
  const isTaskItem = Boolean(selectedEvent?.isTask && selectedEvent.isTask());

  editCommandList.setItems(isTaskItem ? taskEditItems : defaultEditItems);

  updateEventDetailTable(eventDetailTable, selectedEvent);

  const showValidationError = () => {
    logTable.log('Error: All fields must be filled in.');
    screen.render();
  };

  const showTaskValidationError = () => {
    logTable.log('Error: Task title and date must be filled in.');
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

  const finalizeTaskSuccess = async message => {
    await updateTable(auth, leftTable, calendars, events, allEvents);
    logTable.log(message);
    if (!taskFormBox.destroyed) {
      taskFormBox.destroy();
    }
    screen.render();
    leftTable.focus();
    screen.render();
  };

  const setTaskFormValues = values => {
    taskFormFields.title.setValue(values.title || '');
    taskFormFields.date.setValue(values.date || '');
    taskFormFields.description.setValue(values.description || '');
  };

  const collectTaskFormValues = () => ({
    title: taskFormFields.title.getValue().trim(),
    date: taskFormFields.date.getValue().trim(),
    description: taskFormFields.description.getValue(),
  });

  const buildTaskEditorContent = values => {
    const lines = [
      `Task Title | ${values.title || ''}`,
      `Date (YYYY-MM-DD) | ${values.date || ''}`,
      `Notes | ${values.description || ''}`,
    ];
    return `${lines.join('\n')}\n`;
  };

  const parseTaskEditorContent = text => {
    const details = parseEditorFields(text, 'Notes');

    return {
      title: details['Task Title'] || '',
      date: details['Date (YYYY-MM-DD)'] || '',
      description: details['Notes'] || '',
    };
  };

  const setupTaskEditorShortcut = () => {
    const handler = async () => {
      const currentValues = collectTaskFormValues();
      const updatedText = await openEditorAndParseTask(screen, taskTempFilePath, currentValues);
      if (updatedText) {
        setTaskFormValues(updatedText);
        screen.render();
      }
    };

    if (taskFormBox[TASK_ENTER_HANDLER_KEY]) {
      taskFormBox.unkey(['enter'], taskFormBox[TASK_ENTER_HANDLER_KEY]);
    }

    taskFormBox.key(['enter'], handler);
    taskFormBox[TASK_ENTER_HANDLER_KEY] = handler;
  };

  const setupTaskEscapeShortcut = () => {
    const handler = () => {
      if (!taskFormBox.destroyed) {
        taskFormBox.hide();
      }
      leftTable.focus();
      screen.render();
      logTable.log('Add task cancelled.');
    };

    if (taskFormBox[TASK_ESCAPE_HANDLER_KEY]) {
      taskFormBox.unkey(['escape'], taskFormBox[TASK_ESCAPE_HANDLER_KEY]);
    }

    taskFormBox.key(['escape'], handler);
    taskFormBox[TASK_ESCAPE_HANDLER_KEY] = handler;
  };

  const setupTaskSaveShortcut = ({ handler }) => {
    const wrappedHandler = async () => {
      try {
        await handler(collectTaskFormValues());
      } catch (err) {
        console.error('Unexpected error while saving task:', err);
      }
    };

    if (taskFormBox[TASK_SAVE_HANDLER_KEY]) {
      taskFormBox.unkey(['C-s'], taskFormBox[TASK_SAVE_HANDLER_KEY]);
    }

    taskFormBox.key(['C-s'], wrappedHandler);
    taskFormBox[TASK_SAVE_HANDLER_KEY] = wrappedHandler;
  };

  async function openEditorAndParseTask(screen, tempPath, values) {
    const updatedText = await openExternalEditor(screen, tempPath, buildTaskEditorContent(values));

    if (!updatedText) {
      return null;
    }

    return parseTaskEditorContent(updatedText);
  }

  async function promptTaskListSelection(handler) {
    const originalItems = calendarList.items.map(item => item.content);
    const originalLabel = calendarList.options.label;
    let taskLists = [];

    try {
      taskLists = await fetchTaskLists(auth);
    } catch (err) {
      console.error('The API returned an error: ' + err);
      logTable.log('Error: Failed to load task lists.');
      showEditMenu();
      return;
    }

    if (!taskLists.length) {
      logTable.log('Error: No task lists available.');
      showEditMenu();
      return;
    }

    const restoreCalendarList = () => {
      calendarList.setItems(originalItems);
      calendarList.setLabel(originalLabel);
      calendarList.hide();
    };

    calendarList.setItems(taskLists.map(taskList => taskList.title));
    calendarList.setLabel('Task List');
    editCommandList.hide();
    calendarList.show();
    calendarList.focus();
    screen.render();

    waitForListSelection(calendarList, async (_taskItem, taskIndex) => {
      const selectedTaskList = taskLists[taskIndex];

      restoreCalendarList();

      if (!selectedTaskList) {
        logTable.log('Error: Invalid task list selection.');
        showEditMenu();
        return;
      }

      screen.render();
      await handler(selectedTaskList);
    }, () => {
      restoreCalendarList();
      showEditMenu();
    });
  }

  async function prepareTaskForm({ label, initialValues, openEditorImmediately = false }) {
    taskFormBox.setLabel(label);
    setTaskFormValues(initialValues);
    taskFormBox.show();
    taskFormBox.focus();
    screen.render();

    setupTaskEditorShortcut();
    setupTaskEscapeShortcut();

    if (openEditorImmediately) {
      const updatedValues = await openEditorAndParseTask(screen, taskTempFilePath, initialValues);
      if (updatedValues) {
        setTaskFormValues(updatedValues);
        screen.render();
      }
    }
  }

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

  function showEditMenu() {
    eventDetailTable.show();
    editCommandList.show();
    editCommandList.focus();
    screen.render();

    waitForListSelection(editCommandList, selectEditAction, () => {
      editCommandList.setItems(defaultEditItems);
      editCommandList.hide();
      eventDetailTable.hide();
      leftTable.focus();
      screen.render();
    });
  }

  async function selectEditAction(_item, index) {
    eventDetailTable.hide();

    if (isTaskItem) {
      editCommandList.hide();

      try {
        if (index === 0) {
          const message = selectedEvent.isCompleted()
            ? 'Task marked as not done.'
            : 'Task marked as done.';
          await toggleTaskCompletion(auth, selectedEvent);
          await updateTable(auth, leftTable, calendars, events, allEvents);
          logTable.log(message);
        } else if (index === 1) {
          await deleteTask(auth, selectedEvent);
          await updateTable(auth, leftTable, calendars, events, allEvents);
          logTable.log('Task successfully deleted!');
        }
      } catch (err) {
        console.error('The API returned an error: ' + err);
        logTable.log(index === 1 ? 'Error: Failed to delete task.' : 'Error: Failed to update task status.');
      }

      leftTable.focus();
      screen.render();
      editCommandList.setItems(defaultEditItems);
      return;
    }

    const promptCalendarSelection = handler => {
      const choices = setCalendarChoices(calendarList, calendars);
      editCommandList.hide();
      calendarList.show();
      calendarList.focus();
      screen.render();

      waitForListSelection(calendarList, async (_calendarItem, calendarIndex) => {
        const choice = choices[calendarIndex];
        calendarList.hide();

        if (!choice) {
          logTable.log('Error: Invalid calendar selection.');
          showEditMenu();
          return;
        }

        screen.render();
        await handler(choice.label, choice.id);
      }, () => {
        calendarList.hide();
        showEditMenu();
      });
    };

    switch (editActions[index]?.action) {
      case 'addEvent':
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

      case 'addTask':
        promptTaskListSelection(async selectedTaskList => {
          const initialValues = {
            title: '',
            date: fallbackDateInfo?.date || '',
            description: '',
          };

          await prepareTaskForm({
            label: `Add Task - ${selectedTaskList.title}  (Ctrl+S to save)`,
            initialValues,
            openEditorImmediately: true,
          });

          setupTaskSaveShortcut({
            handler: async values => {
              if (!values.title || !values.date) {
                showTaskValidationError();
                return;
              }

              await createTask(auth, selectedTaskList.id, selectedTaskList.title, values);
              await finalizeTaskSuccess('Task successfully registered!');
            },
          });
        });
        break;

      case 'editEvent':
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

          let saving = false;
          let saved = false;
          const sameCalendar = selectedCalendarId === selectedEditCalendarId;

          setupSaveShortcut({
            formBox,
            formFields,
            options: {},
            handler: async values => {
              if (saving || saved) {
                return;
              }

              if (!validateFormValues(values)) {
                showValidationError();
                return;
              }

              saving = true;
              let message = sameCalendar
                ? 'Event successfully updated!'
                : 'Event successfully moved!';

              try {
                const eventResource = buildCalendarEventResource(values);
                if (sameCalendar) {
                  await calendar.events.patch({
                    calendarId: selectedCalendarId,
                    eventId: selectedEventsId,
                    resource: eventResource,
                  });
                  saved = true;
                } else {
                  // Keep the original until the destination has accepted the edited event.
                  await calendar.events.insert({
                    calendarId: selectedEditCalendarId,
                    resource: eventResource,
                  });
                  saved = true;

                  try {
                    await calendar.events.delete({
                      calendarId: selectedCalendarId,
                      eventId: selectedEventsId,
                    });
                  } catch (err) {
                    console.error('The API returned an error: ' + err);
                    // A failed response may follow a successful deletion. Keep the saved copy.
                    message =
                      'Warning: Event saved to destination, but original deletion could not '
                      + 'be confirmed. Both calendars may contain the event. Check before retrying.';
                  }
                }

                await finalizeSuccess(message);
              } catch (err) {
                console.error('The API returned an error: ' + err);
                if (saved) {
                  logTable.log(message);
                  logTable.log('Error: Event saved, but failed to refresh the display. Run sync.');
                  if (!formBox.destroyed) {
                    formBox.destroy();
                  }
                  leftTable.focus();
                } else {
                  logTable.log(
                    sameCalendar
                      ? 'Error: Failed to update event.'
                      : 'Error: Failed to move event. Original event was not deleted.'
                  );
                }
                screen.render();
              } finally {
                saving = false;
              }
            },
          });
        });
        break;

      case 'copyEvent':
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

      case 'deleteEvent':
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

      case 'copyOtherEvent': {
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
        showEditMenu();
        break;
    }
  }

  showEditMenu();
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
  const calendar = createCalendarClient({ version: 'v3', auth });
  const calendarList = screen.children.find(child => child.options.label === 'Calendar List');
  const leftTable = screen.children.find(child => child.options.label === 'Upcoming Events');
  const logTable = screen.children.find(child => child.options.label === 'Gcal.js Log');
  const { formBox, formFields } = createAddForm(screen);
  const tempFilePath = path.join(os.tmpdir(), 'blessed-editor.txt');

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

  const choices = setCalendarChoices(calendarList, calendars);
  const cancelCalendarSelection = () => {
    calendarList.hide();
    leftTable.focus();
    screen.render();
    logTable.log('Copy cancelled.');
  };
  calendarList.show();
  screen.render();
  calendarList.focus();

  waitForListSelection(calendarList, async (_item, index) => {
    const choice = choices[index];
    if (!choice) {
      cancelCalendarSelection();
      return;
    }
    const { label: selectedCalendar, id: selectedCalendarId } = choice;
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
  }, cancelCalendarSelection);
}
