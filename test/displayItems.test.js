import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sqlite3 from 'sqlite3';
import '../src/utils/datePrototype.js';
import Event from '../src/models/event.js';
import Task from '../src/models/task.js';
import { createDisplayItems, createDisplayItemsForEvents } from '../src/ui/displayItems.js';
import { fetchEventsFromDatabase, insertEventsToDatabase } from '../src/services/databaseService.js';

const calendar = { id: 'work', summary: 'Work' };
const referenceDate = new Date(2026, 10, 5);
const day = number => `2026-11-${String(number).padStart(2, '0')}`;

function calendarEvent(start, end, id = 'event') {
  return Event.fromGAPIEvent({ id, start, end, summary: id }, calendar.id, calendar.summary);
}

function timedEvent(start, end) {
  return calendarEvent({ dateTime: start }, { dateTime: end });
}

function assertDisplayDays(event, days) {
  const expected = days.map((date, index) => [day(date), index === 0]);
  const getEventRows = rows => rows
    .filter(row => row.event === event)
    .map(row => [row.date.toLocalISOString().slice(0, 10), row.isFirstDay]);

  assert.deepEqual(getEventRows(createDisplayItems([event], referenceDate)), expected);
  assert.deepEqual(getEventRows(createDisplayItemsForEvents([event])), expected);
}

const cases = [
  ['overnight', timedEvent('2026-11-05T23:00', '2026-11-06T01:00'), [5, 6]],
  ['multiple days', timedEvent('2026-11-05T23:00', '2026-11-08T01:00'), [5, 6, 7, 8]],
  ['same clock time', timedEvent('2026-11-05T09:00', '2026-11-06T09:00'), [5, 6]],
  ['ends at midnight', timedEvent('2026-11-05T23:00', '2026-11-06T00:00'), [5]],
  ['ends after midnight', timedEvent('2026-11-05T23:00', '2026-11-06T00:00:01'), [5, 6]],
  ['same day', timedEvent('2026-11-05T09:00', '2026-11-05T10:00'), [5]],
  ['one all-day date', calendarEvent({ date: day(5) }, { date: day(6) }), [5]],
  ['multiple all-day dates', calendarEvent({ date: day(5) }, { date: day(8) }), [5, 6, 7]],
  ['task at midnight', Task.fromGAPITask({ id: 'task', due: day(5) }), [5]],
];

for (const [label, event, days] of cases) {
  test(`normal and search rows agree for ${label}`, () => assertDisplayDays(event, days));
}

test('preserves all-day dates in a legacy cache and stores explicit event types on sync', async () => {
  const originalDirectory = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), 'gcal-display-items-'));
  try {
    process.chdir(directory);
    await mkdir('db');
    const db = new sqlite3.Database('./db/Gcal.db');
    try {
      await new Promise((resolve, reject) => db.exec(`
        CREATE TABLE Events (id TEXT PRIMARY KEY, start TEXT, end TEXT, summary TEXT,
          description TEXT, calendarId TEXT, calendarName TEXT, itemType TEXT);
        INSERT INTO Events (id, start, end, calendarId)
        VALUES ('legacy', '2026-11-05T00:00:00.000Z', '2026-11-08T00:00:00.000Z', 'work');
      `, err => err ? reject(err) : resolve()));
    } finally {
      await new Promise((resolve, reject) => db.close(err => err ? reject(err) : resolve()));
    }

    const start = day(5);
    const end = day(8);
    const allDay = calendarEvent({ date: start }, { date: end }, 'synced');
    await insertEventsToDatabase([allDay]);
    const events = await fetchEventsFromDatabase([calendar]);
    assert.equal(events.length, 2);
    for (const event of events) {
      assert.equal(event.allDay, true);
      assertDisplayDays(event, [5, 6, 7]);
    }

    const timed = calendarEvent(
      { dateTime: `${start}T00:00:00Z` },
      { dateTime: `${end}T00:00:00Z` },
      'synced'
    );
    await insertEventsToDatabase([timed]);
    const refreshed = await fetchEventsFromDatabase([calendar]);
    assert.equal(refreshed.find(event => event.id === 'synced').allDay, false);
  } finally {
    process.chdir(originalDirectory);
    await rm(directory, { recursive: true, force: true });
  }
});
