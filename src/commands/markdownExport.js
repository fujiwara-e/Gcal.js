import enquirer from 'enquirer';
import { authorize } from '../services/authService.js';
import { fetchCalendars, fetchEventsForExport } from '../services/calendarService.js';
import { createCalendarChoices } from '../ui/calendarChoices.js';
import { formatMarkdownEvents } from '../utils/markdown.js';

const { Input, MultiSelect } = enquirer;
const cancelled = Symbol('prompt cancelled');
const promptTerminal = {
  stdout: process.stderr,
  columns: process.stderr.columns || 80,
  rows: Math.max(1, (process.stderr.rows || 24) - 2),
};

function formatLocalDate(date) {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDefaultDateRange(today = new Date()) {
  const start = new Date(today);
  start.setDate(1);
  start.setMonth(start.getMonth() - 1);
  const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  start.setDate(Math.min(today.getDate(), lastDay));
  return { startDate: formatLocalDate(start), endDate: formatLocalDate(today) };
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value);
}

async function runPrompt(prompt) {
  prompt.once('start', () => {
    // Ctrl+C can close Node's readline interface before Enquirer tears it down.
    const stop = prompt.stop;
    prompt.removeListener('close', stop);
    prompt.once('close', () => {
      try {
        stop();
      } catch (error) {
        if (error.code !== 'ERR_USE_AFTER_CLOSE') throw error;
      }
    });
  });
  try {
    return await prompt.run();
  } catch (error) {
    if (prompt.state.cancelled) throw cancelled;
    throw error;
  }
}

function promptDate(message, initialValue, earliestDate) {
  return runPrompt(new Input({
    ...promptTerminal,
    message,
    onRun() {
      this.input = initialValue;
      this.cursor = initialValue.length;
    },
    validate(value) {
      if (!isValidDate(value)) return '実在する日付を YYYY-MM-DD 形式で入力してください。';
      if (earliestDate && value < earliestDate) return '終了日は開始日以降にしてください。';
      return true;
    },
  }));
}

export function formatMarkdownExport(events, startDate, endDate) {
  const selected = [];
  for (const event of events) {
    if (!Number.isFinite(event.start.getTime())) continue;
    const date = event.allDay ? event.start.toISOString().slice(0, 10) : formatLocalDate(event.start);
    if (date < startDate || date > endDate) continue;
    selected.push({
      date,
      allDay: event.allDay,
      start: event.allDay ? new Date(`${date}T00:00:00`) : event.start,
      summary: event.summary || '(無題)',
    });
  }
  selected.sort((a, b) =>
    a.date.localeCompare(b.date) || Number(b.allDay) - Number(a.allDay) || a.start - b.start
  );
  return formatMarkdownEvents(selected);
}

export async function runMarkdownExport(args) {
  if (args.length) {
    console.error('使い方: cldr md');
    return 1;
  }
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    console.error('cldr md: 対話操作ができるターミナルで実行してください。');
    return 1;
  }

  try {
    const auth = await authorize();
    const calendars = await fetchCalendars(auth);
    if (!calendars.length) {
      console.error('選択できるカレンダーがありません。');
      return 0;
    }

    const ids = await runPrompt(new MultiSelect({
      ...promptTerminal,
      message: '出力するカレンダー（↑↓ で移動、Space で選択、Enter で確定）',
      indicator: { on: '[x]', off: '[ ]' },
      pointer: { on: '›', off: ' ' },
      choices: createCalendarChoices(calendars).map(({ id, label }) => ({ name: id, message: label })),
      validate: value => value.length > 0 || 'カレンダーを 1 件以上選択してください。',
    }));

    const defaults = getDefaultDateRange();
    const startDate = await promptDate('開始日 (YYYY-MM-DD)', defaults.startDate);
    const endDate = await promptDate('終了日 (YYYY-MM-DD)', defaults.endDate, startDate);
    const selectedIds = new Set(ids);
    const selectedCalendars = calendars.filter(({ id }) => selectedIds.has(id));
    const events = await fetchEventsForExport(auth, selectedCalendars, startDate, endDate);
    const markdown = formatMarkdownExport(events, startDate, endDate);
    if (markdown) process.stdout.write(`${markdown}\n`);
    else console.error('指定した期間に該当する予定はありません。');
    return 0;
  } catch (error) {
    if (error === cancelled) return 130;
    throw error;
  }
}
