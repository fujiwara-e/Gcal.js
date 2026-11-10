import test, { before, beforeEach, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { setImmediate as flushInput } from 'node:timers/promises';
import blessed from 'blessed';
import '../src/utils/datePrototype.js';

const originalDirectory = process.cwd();
const originalTmpdir = process.env.TMPDIR;
const title = 'Design | Review | 議事録';
const description = '\n  First | detail\n\nEvent Title | literal body text\nDate (YYYY-MM-DD) | literal body text\n  Last line  \n\n';
let directory;
let fixtureDirectory;
let screen;
let addEvent;
let editEvent;
let Event;
let insertCalendarListToDatabase;

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gcal-editor-roundtrip-'));
  process.env.TMPDIR = directory;
  process.chdir(directory);
  await fs.writeFile('setting.json', '{"tasksEnabled":true}');
  ({ addEvent } = await import('../src/commands/add.js'));
  ({ editEvent } = await import('../src/commands/edit.js'));
  ({ default: Event } = await import('../src/models/event.js'));
  ({ insertCalendarListToDatabase } = await import('../src/services/databaseService.js'));
});

beforeEach(async () => {
  fixtureDirectory = await fs.mkdtemp(path.join(directory, 'case-'));
  process.chdir(fixtureDirectory);
  await fs.mkdir('db');
});

afterEach(async () => {
  if (screen && !screen.destroyed) screen.destroy();
  process.chdir(directory);
  await fs.rm(fixtureDirectory, { recursive: true, force: true });
});

after(async () => {
  process.chdir(originalDirectory);
  if (originalTmpdir === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = originalTmpdir;
  await fs.rm(directory, { recursive: true, force: true });
});

async function createFixture() {
  const input = new PassThrough();
  const output = new Writable({ write(_chunk, _encoding, done) { done(); } });
  output.columns = 120;
  output.rows = 40;
  output.isTTY = true;
  screen = blessed.screen({ input, output, terminal: 'xterm-256color', fullUnicode: true });
  const widgets = {};
  for (const label of [
    'Calendar List', 'Upcoming Events', 'Current Events', 'Edit List', 'Event Details',
  ]) {
    widgets[label] = blessed.list({ parent: screen, label, width: 50, height: 10, keys: true });
  }
  blessed.log({ parent: screen, label: 'Gcal.js Log', width: 100, height: 10 });
  screen.exec = (_command, _args, _options, done) => done(null, true);

  const calendars = [{ id: 'work', summary: 'Work', syncToken: null }];
  await insertCalendarListToDatabase(calendars);
  const writes = [];
  const auth = { request: async options => {
    const url = new URL(options.url);
    if (url.pathname.endsWith('/users/@me/lists')) {
      return { data: { items: [{ id: 'tasks', title: 'Tasks' }] } };
    }
    if (options.method === 'GET') return { data: { items: [] } };
    writes.push({ method: options.method, pathname: url.pathname, data: options.data });
    return { data: { id: 'saved', ...options.data } };
  } };
  return { widgets, calendars, writes, auth };
}

async function select(list, index) {
  const handler = list.listeners('select')[0];
  assert.equal(typeof handler, 'function');
  await handler.call(list, null, index);
}

async function selectAction(list, label) {
  const index = list.ritems.indexOf(label);
  assert.notEqual(index, -1);
  await select(list, index);
}

function field(form, label) {
  return form.children.find(child => child.options.label === label);
}

async function save(form) {
  const closed = new Promise(resolve => form.once('destroy', resolve));
  await form.listeners('key C-s')[0]();
  await closed;
}

for (const action of ['イベントを編集', 'イベントをコピー']) {
  test(`unchanged external editor preserves title and description when choosing ${action}`, { timeout: 3000 }, async () => {
    const f = await createFixture();
    const source = new Event(
      'original', new Date(2026, 10, 11, 10), new Date(2026, 10, 11, 11),
      title, description, 'work', 'Work'
    );
    editEvent(f.auth, screen, f.calendars, source, [source], [source]);
    await selectAction(f.widgets['Edit List'], action);
    await select(f.widgets['Calendar List'], 0);
    const form = screen.children.find(child => child.options.formType === 'event');
    assert.equal(field(form, 'Event Title').getValue(), title);
    assert.equal(field(form, 'Description').getValue(), description);

    await save(form);

    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].method, action === 'イベントを編集' ? 'PATCH' : 'POST');
    assert.equal(f.writes[0].data.summary, title);
    assert.equal(f.writes[0].data.description, description);
  });
}

test('manual add preserves multiline external-editor content through another editor visit and save', { timeout: 3000 }, async () => {
  const f = await createFixture();
  let visits = 0;
  screen.exec = (_command, [filename], _options, done) => {
    if (visits++ === 0) {
      writeFileSync(filename, [
        `Event Title | ${title}`,
        'Date (YYYY-MM-DD) | 2026-11-11',
        'Start Time (HH:mm) | 10:00',
        'End Time (HH:mm) | 11:00',
        'All Day (y/n) | n',
        `Description | ${description}`,
        '',
      ].join('\n'));
    }
    done(null, true);
  };
  addEvent(f.auth, screen, f.calendars, [], []);
  await select(f.widgets['Calendar List'], 0);
  await flushInput();
  const form = screen.children.find(child => child.options.formType === 'event');
  assert.equal(field(form, 'Description').getValue(), description);
  await form.listeners('key enter')[0]();
  assert.equal(visits, 2);

  await save(form);

  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].data.summary, title);
  assert.equal(f.writes[0].data.description, description);
});

test('task creation preserves pipes and multiline notes through editor reentry and API save', { timeout: 3000 }, async () => {
  const f = await createFixture();
  const notes = '\n  First | detail\n\nTask Title | literal body text\nNotes | literal body text\n  Last line  \n\n';
  let visits = 0;
  screen.exec = (_command, [filename], _options, done) => {
    if (visits++ === 0) {
      writeFileSync(filename, [
        `Task Title | ${title}`,
        'Date (YYYY-MM-DD) | 2026-11-11',
        `Notes | ${notes}`,
        '',
      ].join('\n'));
    }
    done(null, true);
  };
  editEvent(f.auth, screen, f.calendars, null, [], [], new Date(2026, 10, 11));
  await selectAction(f.widgets['Edit List'], '選択日にタスクを追加');
  await flushInput();
  await select(f.widgets['Calendar List'], 0);
  const form = screen.children.find(child => child.options.formType === 'task');
  assert.equal(field(form, 'Task Title').getValue(), title);
  assert.equal(field(form, 'Notes').getValue(), notes);
  await form.listeners('key enter')[0]();
  assert.equal(visits, 2);

  await save(form);

  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].pathname, '/tasks/v1/lists/tasks/tasks');
  assert.equal(f.writes[0].data.title, title);
  assert.equal(f.writes[0].data.notes, notes);
});
