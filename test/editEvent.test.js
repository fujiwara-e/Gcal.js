import test, { before, beforeEach, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { setImmediate as flushInput, setTimeout as delay } from 'node:timers/promises';
import blessed from 'blessed';
import '../src/utils/datePrototype.js';

const originalDirectory = process.cwd();
const createBlessedScreen = blessed.screen;
let directory;
let fixtureDirectory;
let screen;
let editEvent;
let db;
let Event;

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gcal-edit-'));
  process.chdir(directory);
  await fs.writeFile('setting.json', '{"tasksEnabled":false}');
  ({ editEvent } = await import('../src/commands/edit.js'));
  db = await import('../src/services/databaseService.js');
  ({ default: Event } = await import('../src/models/event.js'));
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
  await fs.rm(directory, { recursive: true, force: true });
});

function createTerminalScreen(options = {}) {
  const input = new PassThrough();
  input.isTTY = false;
  const output = new Writable({ write(_chunk, _encoding, done) { done(); } });
  output.columns = 120;
  output.rows = 40;
  output.isTTY = true;
  return createBlessedScreen({ ...options, input, output, terminal: 'xterm-256color' });
}

function createEditScreen() {
  screen = createTerminalScreen();
  const widgets = {};
  for (const label of [
    'Calendar List', 'Upcoming Events', 'Current Events', 'Edit List', 'Event Details',
  ]) {
    widgets[label] = blessed.list({ parent: screen, label, width: 50, height: 10, keys: true });
  }
  const log = blessed.log({ parent: screen, label: 'Gcal.js Log', width: 120, height: 10 });
  const logs = [];
  log.log = message => logs.push(message);
  // Exercise editor parsing without launching an external process.
  screen.exec = (_command, _args, _options, done) => done(null, true);
  return { widgets, logs };
}

async function openEdit(t, destination = 'source') {
  const { widgets, logs } = createEditScreen();
  t.mock.method(console, 'error', () => {});

  const start = new Date();
  start.setHours(10, 0, 0, 0);
  const original = {
    id: 'original', status: 'confirmed', summary: 'Original', description: 'Original notes',
    start: { dateTime: start.toISOString() },
    end: { dateTime: new Date(start.getTime() + 3600000).toISOString() },
    location: 'Meeting room', attendees: [{ email: 'guest@example.com' }],
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] },
  };
  const state = {
    remote: new Map([['source/original', structuredClone(original)]]),
    writes: [], logs, failure: null, block: null, onWrite: null, failRefresh: false,
  };
  const cancelled = [];
  const auth = { request: async options => {
    const match = new URL(options.url).pathname.match(/\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    assert.ok(match, `Unexpected API URL: ${options.url}`);
    const [, calendarId, eventId] = match;
    const method = options.method || 'GET';
    const key = `${calendarId}/${eventId}`;
    if (method === 'GET') {
      if (state.failRefresh) throw new Error('Refresh unavailable');
      const items = [...state.remote.entries()]
        .filter(([id]) => id.startsWith(`${calendarId}/`)).map(([, event]) => event);
      items.push(...cancelled.filter(event => event.calendarId === calendarId));
      return { data: { items, nextSyncToken: 'next-token' } };
    }

    state.writes.push({ method, calendarId, eventId, data: options.data });
    state.onWrite?.();
    if (state.block) await state.block;
    const failure = state.failure?.method === method ? state.failure : null;
    if (failure && !failure.afterCommit) throw new Error(failure.message);

    let data;
    if (method === 'PATCH') {
      assert.ok(state.remote.has(key));
      data = { ...state.remote.get(key), ...options.data };
      state.remote.set(key, data);
    } else if (method === 'POST') {
      data = { ...options.data, id: 'copy', status: 'confirmed' };
      state.remote.set(`${calendarId}/copy`, data);
    } else if (method === 'DELETE') {
      assert.ok(state.remote.delete(key));
      cancelled.push({ id: eventId, status: 'cancelled', calendarId });
    } else {
      assert.fail(`Unexpected method: ${method}`);
    }
    if (failure) throw new Error(failure.message);
    return { data };
  } };

  const calendars = ['source', 'destination'].map(id => ({ id, summary: id, syncToken: null }));
  await db.insertCalendarListToDatabase(calendars);
  const selectedEvent = Event.fromGAPIEvent(original, 'source', 'source');
  const events = [selectedEvent];
  const allEvents = [...events];
  await db.insertEventsToDatabase(events);
  editEvent(auth, screen, calendars, selectedEvent, events, allEvents);
  const editList = widgets['Edit List'];
  await editList.listeners('select')[0].call(editList, null, 1);
  const calendarList = widgets['Calendar List'];
  await calendarList.listeners('select')[0].call(
    calendarList, null, destination === 'source' ? 0 : 1
  );
  const form = screen.children.find(child => child.options.formType === 'event');
  form.children.find(child => child.options.label === 'Event Title').setValue('Edited');
  form.children.find(child => child.options.label === 'Description').setValue('Edited notes');
  form.children.find(child => child.options.label === 'Start Time (HH:mm)').setValue('13:30');
  form.children.find(child => child.options.label === 'End Time (HH:mm)').setValue('14:15');
  const save = form.listeners('key C-s')[0];
  assert.equal(typeof save, 'function');
  return { ...state, state, original, form, save, events, allEvents, calendars };
}

test('Escape in Calendar List returns to the edit menu and allows adding again', t => {
  const { widgets } = createEditScreen();
  const editor = t.mock.method(screen, 'exec');
  const calendars = [{ id: 'source', summary: 'source' }];
  const calendarList = widgets['Calendar List'];
  const editList = widgets['Edit List'];
  const details = widgets['Event Details'];
  const press = name => screen.program.emit('keypress', null, { name, full: name });
  const openMenu = () => editEvent({}, screen, calendars, null, [], [], new Date(2026, 10, 10));
  calendarList.setItems(['source']);
  calendarList.hide();
  openMenu();

  for (let attempt = 0; attempt < 2; attempt++) {
    press('enter');
    assert.equal(screen.focused, calendarList);
    press('escape');
    assert.equal(calendarList.hidden, true);
    assert.equal(editList.hidden, false);
    assert.equal(details.hidden, false);
    assert.equal(screen.focused, editList);
    assert.equal(calendarList.listeners('select').length, 0);
    assert.equal(editor.mock.callCount(), 0);
  }

  press('escape');
  assert.equal(editList.hidden, true);
  assert.equal(screen.focused, widgets['Upcoming Events']);

  openMenu();
  press('enter');
  press('enter');
  const form = screen.children.find(child => child.options.formType === 'event');
  assert.equal(calendarList.hidden, true);
  assert.equal(calendarList.listeners('cancel').length, 0);
  assert.equal(form.hidden, false);
  assert.equal(editor.mock.callCount(), 1);
});

test('Escape after completing add returns to Commandline and permits retry', async t => {
  const { createLayout } = await import('../src/ui/layout.js');
  const { handleInput } = await import('../src/ui/inputHandler.js');
  const { setupKeyBindings } = await import('../src/ui/keyConfig.js');
  const calendars = [{ id: 'source', summary: 'source' }];
  const events = [];
  const auth = {};
  const createScreen = t.mock.method(blessed, 'screen', createTerminalScreen);
  const layout = createLayout(calendars, events);
  createScreen.mock.restore();
  screen = layout.screen;
  const { inputBox, keypressListener } = layout;
  const calendarList = screen.children.find(child => child.options.label === 'Calendar List');
  const editor = t.mock.method(screen, 'exec', (_command, _args, _options, done) => done(null, true));
  const press = (name, ch) => screen.program.emit('keypress', ch, { name, full: name });
  inputBox.on('submit', value => {
    inputBox.clearValue();
    inputBox.hide();
    handleInput(auth, value, screen, calendars, events, events, keypressListener);
  });
  setupKeyBindings(screen, auth, calendars, events, events, inputBox);

  press('a', 'a');
  assert.equal(screen.focused.options.label, 'Calendar List');
  press('escape');
  assert.equal(screen.focused.options.label, 'Upcoming Events');
  assert.equal(inputBox.hidden, true);

  press('space', ' ');
  await delay(20);
  const completion = screen.children.find(child => child.options.label === 'Command Completion');
  const addIndex = completion.items.findIndex(item => item.getText() === 'add');
  assert.notEqual(addIndex, -1);
  completion.select(addIndex);
  completion.items[addIndex].emit('click');
  assert.equal(inputBox.getValue(), 'add ');
  await flushInput();

  for (let attempt = 0; attempt < 2; attempt++) {
    press('enter');
    assert.equal(screen.focused.options.label, 'Calendar List');
    press('escape');
    assert.equal(calendarList.hidden, true);
    assert.equal(screen.focused.options.label, 'Commandline');
    assert.equal(inputBox.getValue(), 'add ');
    assert.equal(calendarList.listeners('select').length, 0);
    assert.equal(editor.mock.callCount(), 0);
    await delay(20);
  }

  press('enter');
  press('enter');
  const form = screen.children.find(child => child.options.formType === 'event');
  assert.equal(calendarList.hidden, true);
  assert.equal(inputBox.hidden, true);
  assert.equal(form.hidden, false);
  assert.equal(editor.mock.callCount(), 1);
  assert.equal(form.listeners('key C-s').length, 1);
});

test('same-calendar editing patches the existing event and preserves other fields', async t => {
  const f = await openEdit(t);
  await f.save();
  assert.deepEqual(f.writes.map(call => call.method), ['PATCH']);
  assert.equal(f.remote.size, 1);
  const updated = f.remote.get('source/original');
  assert.equal(updated.summary, 'Edited');
  assert.equal(updated.description, 'Edited notes');
  assert.equal(new Date(updated.start.dateTime).getHours(), 13);
  assert.equal(new Date(updated.start.dateTime).getMinutes(), 30);
  assert.equal(new Date(updated.end.dateTime).getHours(), 14);
  assert.equal(new Date(updated.end.dateTime).getMinutes(), 15);
  assert.deepEqual(updated.attendees, f.original.attendees);
  assert.deepEqual(updated.reminders, f.original.reminders);
  assert.equal(updated.location, f.original.location);
  assert.equal(f.events[0].id, 'original');
  assert.equal(f.events[0].summary, 'Edited');
  assert.equal(f.allEvents[0].summary, 'Edited');
  assert.equal(f.form.destroyed, true);
  assert.ok(f.logs.includes('Event successfully updated!'));
});

test('moving creates the destination event before deleting the original and refreshes the cache', async t => {
  const f = await openEdit(t, 'destination');
  await f.save();
  assert.deepEqual(f.writes.map(call => [call.method, call.calendarId]), [
    ['POST', 'destination'], ['DELETE', 'source'],
  ]);
  assert.equal(f.remote.size, 1);
  assert.equal(f.remote.get('destination/copy').summary, 'Edited');
  assert.equal(f.events.length, 1);
  assert.equal(f.allEvents.length, 1);
  assert.equal(f.events[0].calendarId, 'destination');
  assert.equal(f.events[0].summary, 'Edited');
  assert.equal(f.form.destroyed, true);
  assert.ok(f.logs.includes('Event successfully moved!'));
});

for (const destination of ['source', 'destination']) {
  for (const message of ['403 read-only calendar', '400 invalid event', 'Network unavailable']) {
    test(`${destination} save failure (${message}) leaves the original and permits retry`, async t => {
      const f = await openEdit(t, destination);
      const method = destination === 'source' ? 'PATCH' : 'POST';
      f.state.failure = { method, message };
      await f.save();
      assert.deepEqual(f.writes.map(call => call.method), [method]);
      assert.deepEqual([...f.remote.entries()], [['source/original', f.original]]);
      assert.ok(!f.form.destroyed);
      assert.equal(f.events[0].summary, 'Original');
      assert.ok(f.logs.some(message => message.startsWith('Error: Failed to')));

      f.state.failure = null;
      await f.save();
      assert.equal(f.remote.size, 1);
      assert.equal([...f.remote.values()][0].summary, 'Edited');
      assert.equal(f.form.destroyed, true);
    });
  }
}

test('a lost insertion response never triggers deletion of the original', async t => {
  const f = await openEdit(t, 'destination');
  f.state.failure = { method: 'POST', message: 'Response lost', afterCommit: true };
  await f.save();
  assert.deepEqual(f.writes.map(call => call.method), ['POST']);
  assert.deepEqual(f.remote.get('source/original'), f.original);
  assert.equal(f.remote.get('destination/copy').summary, 'Edited');
  assert.ok(f.logs.some(message => message.includes('Original event was not deleted')));
});

for (const afterCommit of [false, true]) {
  test(`deletion failure (committed=${afterCommit}) keeps the destination and reports uncertainty`, async t => {
    const f = await openEdit(t, 'destination');
    f.state.failure = { method: 'DELETE', message: 'Connection lost', afterCommit };
    await f.save();
    assert.equal(f.remote.get('destination/copy').summary, 'Edited');
    assert.equal(f.remote.has('source/original'), !afterCommit);
    assert.equal(f.events.length, afterCommit ? 1 : 2);
    assert.ok(f.logs.some(message => message.includes('original deletion could not be confirmed')));
    assert.ok(!f.logs.includes('Event successfully moved!'));
    assert.equal(f.form.destroyed, true);
    await f.save();
    assert.deepEqual(f.writes.map(call => call.method), ['POST', 'DELETE']);
  });
}

test('repeated saves during a move issue only one creation and one deletion', async t => {
  const f = await openEdit(t, 'destination');
  let release;
  f.state.block = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { f.state.onWrite = resolve; });
  const firstSave = f.save();
  await started;
  await f.save();
  assert.deepEqual(f.writes.map(call => call.method), ['POST']);
  assert.deepEqual(f.remote.get('source/original'), f.original);
  release();
  await firstSave;
  await f.save();
  assert.deepEqual(f.writes.map(call => call.method), ['POST', 'DELETE']);
  assert.equal(f.remote.size, 1);
});

test('refresh failure after saving reports the saved event and prevents another creation', async t => {
  const f = await openEdit(t, 'destination');
  f.state.failRefresh = true;
  await f.save();
  assert.equal(f.remote.size, 1);
  assert.equal(f.remote.get('destination/copy').summary, 'Edited');
  assert.ok(f.logs.some(message => message.includes('Event saved, but failed to refresh')));
  assert.equal(f.form.destroyed, true);
  await f.save();
  assert.deepEqual(f.writes.map(call => call.method), ['POST', 'DELETE']);
});
