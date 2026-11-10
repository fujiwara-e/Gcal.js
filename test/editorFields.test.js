import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEditorContent, parseEditorContent } from '../src/utils/eventFormUtils.js';
import { parseEditorFields } from '../src/utils/editor.js';

test('event editor round trips preserve pipes, multiline descriptions and body whitespace', () => {
  const descriptions = [
    '',
    'Agenda | Decisions | Follow-up',
    'First line\n\n  Indented line | detail\nLast line',
    '\n  Leading indentation\nEvent Title | Body text\nDescription | Still body text\n\n',
    '  Body with trailing spaces  ',
  ];
  for (const includeAllDay of [false, true]) {
    for (const description of descriptions) {
      const values = {
        title: 'Design | Review | Next steps',
        date: '2026-11-11',
        startTime: '10:00',
        endTime: '11:00',
        description,
        ...(includeAllDay ? { allDay: true } : {}),
      };
      const content = buildEditorContent(values, { includeAllDay });
      for (const newline of ['\n', '\r\n']) {
        const parsed = parseEditorContent(content.replace(/\n/g, newline), { includeAllDay });
        assert.deepEqual(parsed, values);
      }
    }
  }
});

test('task editor fields retain pipes and lines resembling headers in notes', () => {
  const notes = '\n  Notes | detail\nTask Title | This is part of the notes\n\n';
  const content = `Task Title | Task | review\nDate (YYYY-MM-DD) | 2026-11-11\nNotes | ${notes}\n`;
  assert.deepEqual(parseEditorFields(content, 'Notes'), {
    'Task Title': 'Task | review',
    'Date (YYYY-MM-DD)': '2026-11-11',
    Notes: notes,
  });
});

test('existing single-line templates accept compact separators and no final newline', () => {
  const parsed = parseEditorContent([
    'Event Title|Title | detail',
    'Date (YYYY-MM-DD) | 2026-11-11',
    'Start Time (HH:mm) | 10:00',
    'End Time (HH:mm) | 11:00',
    'All Day (y/n)| Y',
    'Description|First line',
    'Second line',
  ].join('\n'), { includeAllDay: true });
  assert.deepEqual(parsed, {
    title: 'Title | detail',
    date: '2026-11-11',
    startTime: '10:00',
    endTime: '11:00',
    description: 'First line\nSecond line',
    allDay: true,
  });
});
