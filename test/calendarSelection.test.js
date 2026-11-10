import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { setImmediate as flush } from 'node:timers/promises';
import blessed from 'blessed';
import '../src/utils/datePrototype.js';

test('duplicate calendar names preserve the selected destination for event writes', { timeout: 5000 }, async t => {
  const originalDirectory = process.cwd();
  const originalTempDirectory = process.env.TMPDIR;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gcal-calendar-selection-'));
  let screen;
  t.after(async () => {
    if (screen && !screen.destroyed) screen.destroy();
    process.chdir(originalDirectory);
    if (originalTempDirectory === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = originalTempDirectory;
    await fs.rm(directory, { recursive: true, force: true });
  });
  process.chdir(directory);
  process.env.TMPDIR = directory;
  await fs.mkdir('db');
  await fs.writeFile('setting.json', '{"tasksEnabled":false}');
  await fs.writeFile('.env', 'GEMINI_API_KEY=test-key');

  const { createLayout } = await import('../src/ui/layout.js');
  const { addEvent } = await import('../src/commands/add.js');
  const { addEventNL } = await import('../src/commands/addNL.js');
  const { configCommand } = await import('../src/commands/config.js');
  const { editEvent, copyEventToDate } = await import('../src/commands/edit.js');
  const { GeminiNLPService } = await import('../src/services/geminiService.js');
  const { insertCalendarListToDatabase, fetchCalendarsFromDatabase } = await import('../src/services/databaseService.js');
  const { default: Event } = await import('../src/models/event.js');
  const calendarRows = [
    { id: 'one', summary: 'Shared' },
    { id: 'two', summary: 'Shared' },
    { id: 'three', summary: 'Other' },
  ];
  await insertCalendarListToDatabase(calendarRows);
  const calendars = await fetchCalendarsFromDatabase();
  const events = [];
  const allEvents = [];

  const originalScreen = blessed.screen;
  const terminal = t.mock.method(blessed, 'screen', options => {
    const input = new PassThrough();
    const output = new Writable({ write(_chunk, _encoding, done) { done(); } });
    output.columns = 120;
    output.rows = 40;
    output.isTTY = true;
    return originalScreen({ ...options, input, output, terminal: 'xterm-256color' });
  });
  ({ screen } = createLayout(calendars, events));
  terminal.mock.restore();

  const eventValues = {
    title: 'Sample', date: '2026-11-10', startTime: '10:00', endTime: '11:00',
    description: '', allDay: false, confidence: 1, interpretation: 'Fixture',
  };
  t.mock.method(GeminiNLPService.prototype, 'parseNaturalLanguageEvent', async () => eventValues);
  t.mock.method(screen, 'exec', (_command, [file], _options, done) => {
    writeFileSync(file, [
      `Event Title | ${eventValues.title}`,
      `Date (YYYY-MM-DD) | ${eventValues.date}`,
      `Start Time (HH:mm) | ${eventValues.startTime}`,
      `End Time (HH:mm) | ${eventValues.endTime}`,
      'All Day (y/n) | n',
      'Description |',
    ].join('\n'));
    done(null, true);
  });

  const writes = [];
  const auth = { request: async options => {
    const pathname = new URL(options.url).pathname;
    if (pathname.endsWith('/colors')) return { data: { calendar: {} } };
    if (pathname.endsWith('/calendarList')) return { data: { items: calendarRows } };
    const match = pathname.match(/\/calendars\/([^/]+)\/events(?:\/[^/]+)?$/);
    assert.ok(match, `Unexpected API request: ${pathname}`);
    if (options.method === 'GET') return { data: { items: [], nextSyncToken: 'synced' } };
    writes.push([options.method, match[1]]);
    return { data: options.data };
  } };

  const widget = label => screen.children.find(child => child.options.label === label);
  const calendarList = widget('Calendar List');
  const log = widget('Gcal.js Log');
  function selectCalendar(label) {
    assert.deepEqual(calendarList.items.map(item => item.getText()), ['Shared (one)', 'Shared (two)', 'Other']);
    calendarList.enterSelected(calendarList.items.findIndex(item => item.getText() === label));
  }
  async function saveEvent() {
    const form = screen.children.find(child => child.options.formType === 'event');
    const saved = new Promise(resolve => {
      log.log = message => { if (message.startsWith('Event successfully')) resolve(); };
    });
    form.emit('key C-s');
    await saved;
  }

  addEvent(auth, screen, calendars, events, allEvents);
  selectCalendar('Other');
  await flush();
  await saveEvent();

  addEvent(auth, screen, calendars, events, allEvents);
  await addEventNL(auth, screen, calendars, events, allEvents);
  assert.equal(calendarList.listeners('select').length, 1);
  calendarList.cancelSelected();
  assert.equal(calendarList.listeners('select').length, 0);

  await addEventNL(auth, screen, calendars, events, allEvents);
  selectCalendar('Shared (one)');
  screen.focused.setValue('Fixture');
  screen.focused.emit('key enter');
  await flush();
  await saveEvent();

  await configCommand(auth, screen, calendars, events, allEvents);
  const configForm = screen.children.find(child => child.type === 'form');
  const configLabels = configForm.children.filter(child => child.type === 'checkbox').map(child => child.text);
  assert.deepEqual(configLabels, ['Shared (one)', 'Shared (two)', 'Other']);
  await configForm.listeners('key C-s')[0]();

  const start = new Date(2026, 10, 10, 10);
  const end = new Date(2026, 10, 10, 11);
  const source = new Event('original', start, end, 'Original', '', 'two', 'Shared');
  editEvent(auth, screen, calendars, source, events, allEvents);
  widget('Edit List').enterSelected(1);
  selectCalendar('Shared (two)');
  await flush();
  await saveEvent();

  await copyEventToDate(auth, screen, calendars, source, start, events, allEvents);
  selectCalendar('Other');
  await flush();
  await saveEvent();

  assert.deepEqual(writes, [['POST', 'three'], ['POST', 'one'], ['PATCH', 'two'], ['POST', 'three']]);
});
