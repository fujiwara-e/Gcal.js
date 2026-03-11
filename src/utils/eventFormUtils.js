/**
 * イベントフォームに関するヘルパー関数群
 * エディタ内容の構築・パース、フォーム操作、バリデーション、Google API リソース構築
 */
import { splitDateTimeIntoDateAndTime, convertToDateTime } from './dateUtils.js';
import { openExternalEditor } from './editor.js';

const ENTER_HANDLER_KEY = Symbol('formBoxEnterHandler');
const SAVE_HANDLER_KEY = Symbol('formBoxSaveHandler');
const ESCAPE_HANDLER_KEY = Symbol('formBoxEscapeHandler');

export function buildEditorContent(values, { includeAllDay = false } = {}) {
  const {
    title = '',
    date = '',
    startTime = '',
    endTime = '',
    description = '',
    allDay = false,
  } = values;

  const lines = [
    `Event Title | ${title}`,
    `Date (YYYY-MM-DD) | ${date}`,
    `Start Time (HH:mm) | ${startTime}`,
    `End Time (HH:mm) | ${endTime}`,
  ];

  if (includeAllDay) {
    lines.push(`All Day (y/n) | ${allDay ? 'y' : 'n'}`);
  }

  lines.push(`Description | ${description}`);

  return `${lines.join('\n')}\n`;
}

export function parseEditorContent(text, { includeAllDay = false } = {}) {
  const details = {};

  text.split('\n').forEach(line => {
    const parts = line.split('|').map(part => part.trim());
    if (parts.length === 2) {
      const [label, value] = parts;
      details[label] = value;
    }
  });

  const parsed = {
    title: details['Event Title'] || '',
    date: details['Date (YYYY-MM-DD)'] || '',
    startTime: details['Start Time (HH:mm)'] || '',
    endTime: details['End Time (HH:mm)'] || '',
    description: details['Description'] || '',
  };

  if (includeAllDay) {
    parsed.allDay = (details['All Day (y/n)'] || 'n').toLowerCase() === 'y';
  }

  return parsed;
}

export function applyDetailsToForm(formFields, details, { includeAllDay = false } = {}) {
  formFields.title.setValue(details.title || '');
  formFields.date.setValue(details.date || '');
  formFields.startTime.setValue(details.startTime || '');
  formFields.endTime.setValue(details.endTime || '');
  formFields.description.setValue(details.description || '');

  if (includeAllDay && formFields.all_day) {
    if (details.allDay) {
      formFields.all_day.check();
    } else {
      formFields.all_day.uncheck();
    }
  }
}

export function collectFormValues(formFields, { includeAllDay = false } = {}) {
  const values = {
    title: formFields.title.getValue().trim(),
    date: formFields.date.getValue().trim(),
    startTime: formFields.startTime.getValue().trim(),
    endTime: formFields.endTime.getValue().trim(),
    description: formFields.description.getValue().trim(),
  };

  if (includeAllDay) {
    values.allDay = !!formFields.all_day?.checked;
  } else {
    values.allDay = false;
  }

  return values;
}

export function isAllDayEvent(event) {
  return Boolean(event?.start?.date && !event?.start?.dateTime);
}

export function formatEventDate(dateLike) {
  if (!dateLike) {
    return null;
  }

  const dateObj = new Date(dateLike);
  if (Number.isNaN(dateObj.getTime())) {
    return null;
  }

  return splitDateTimeIntoDateAndTime(dateObj);
}

export function eventToFormValues(event, fallbackDate = null) {
  const startInfo = formatEventDate(event?.start) || formatEventDate(fallbackDate);
  const endInfo = formatEventDate(event?.end) || startInfo;

  return {
    title: event?.summary || '',
    date: startInfo?.date || '',
    startTime: event ? startInfo?.time || '' : '',
    endTime: event ? endInfo?.time || '' : '',
    description: event?.description || '',
    allDay: event ? isAllDayEvent(event) : false,
  };
}

export function buildCalendarEventResource(values) {
  const { title, description, date, startTime, endTime, allDay } = values;

  if (allDay) {
    return {
      summary: title,
      description,
      start: { date },
      end: { date },
    };
  }

  return {
    summary: title,
    description,
    start: {
      dateTime: convertToDateTime(date, startTime).toISOString(),
    },
    end: {
      dateTime: convertToDateTime(date, endTime).toISOString(),
    },
  };
}

export function validateFormValues(values) {
  return values.title && values.date && values.startTime && values.endTime;
}

export function assignKeyHandler(element, keys, handler, storageKey) {
  const existingHandler = element[storageKey];

  if (existingHandler) {
    if (typeof element.unkey === 'function') {
      element.unkey(keys, existingHandler);
    } else {
      element.removeListener?.('keypress', existingHandler);
    }
  }

  if (typeof element.key === 'function') {
    element.key(keys, handler);
  }

  element[storageKey] = handler;
}

export async function openEditorAndParse(screen, tempFilePath, values, options) {
  const content = buildEditorContent(values, options);
  const updatedText = await openExternalEditor(screen, tempFilePath, content);

  if (!updatedText) {
    return null;
  }

  return parseEditorContent(updatedText, options);
}

export function setupEditorShortcut({ formBox, formFields, screen, tempFilePath, options }) {
  const handler = async () => {
    const currentValues = collectFormValues(formFields, options);
    const updatedValues = await openEditorAndParse(screen, tempFilePath, currentValues, options);

    if (updatedValues) {
      applyDetailsToForm(formFields, updatedValues, options);
      screen.render();
    }
  };

  assignKeyHandler(formBox, ['enter'], handler, ENTER_HANDLER_KEY);
}

export function setupSaveShortcut({ formBox, formFields, handler, options }) {
  const wrappedHandler = async () => {
    const values = collectFormValues(formFields, options);

    try {
      await handler(values);
    } catch (err) {
      console.error('Unexpected error while saving event:', err);
    }
  };

  assignKeyHandler(formBox, ['C-s'], wrappedHandler, SAVE_HANDLER_KEY);
}

export function setupEscapeShortcut({ formBox, leftTable, logTable, screen }) {
  const handler = () => {
    if (!formBox.destroyed) {
      formBox.hide();
    }
    leftTable.focus();
    screen.render();
    logTable.log('Edit event cancelled.');
  };

  assignKeyHandler(formBox, ['escape'], handler, ESCAPE_HANDLER_KEY);
}
