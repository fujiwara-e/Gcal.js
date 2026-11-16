import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMarkdownExport, getDefaultDateRange } from '../src/commands/markdownExport.js';
import { fetchEventsForExport } from '../src/services/calendarService.js';

test('the default range covers one calendar month with the previous month end as a fallback', () => {
  assert.deepEqual(getDefaultDateRange(new Date(2024, 2, 31)), {
    startDate: '2024-02-29',
    endDate: '2024-03-31',
  });
  assert.deepEqual(getDefaultDateRange(new Date(2025, 2, 31)), {
    startDate: '2025-02-28',
    endDate: '2025-03-31',
  });
  assert.deepEqual(getDefaultDateRange(new Date(2025, 0, 16)), {
    startDate: '2024-12-16',
    endDate: '2025-01-16',
  });
});

test('the export pages through selected calendars and filters on the inclusive local start date', async () => {
  const calls = [];
  const auth = {
    async request({ params, url }) {
      calls.push({ params, url: String(url) });
      if (String(url).includes('/team/')) {
        return { data: { items: [
          timedEvent('Late meeting', '2026-11-16T23:30:00', '2026-11-17T00:30:00'),
          timedEvent('Tomorrow', '2026-11-17T00:00:00', '2026-11-17T01:00:00'),
        ] } };
      }
      if (!params.pageToken) {
        return { data: {
          items: [{ summary: 'Holiday', start: { date: '2026-11-16' }, end: { date: '2026-11-17' } }],
          nextPageToken: 'page2',
        } };
      }
      return { data: { items: [
        timedEvent('Start day', '2026-10-16T00:00:00', '2026-10-16T01:00:00'),
        timedEvent('Started earlier', '2026-10-15T23:00:00', '2026-10-16T02:00:00'),
        { status: 'cancelled' },
      ] } };
    },
  };
  const events = await fetchEventsForExport(auth, [
    { id: 'personal', summary: 'Personal' },
    { id: 'team', summary: 'Team' },
  ], '2026-10-16', '2026-11-16');

  assert.deepEqual(calls.map(({ url, params }) => [new URL(url).pathname, params.pageToken]), [
    ['/calendar/v3/calendars/personal/events', undefined],
    ['/calendar/v3/calendars/team/events', undefined],
    ['/calendar/v3/calendars/personal/events', 'page2'],
  ]);
  for (const { params } of calls) {
    assert.equal(params.singleEvents, true);
    assert.equal(params.showDeleted, false);
    assert.equal(params.timeMin, '2026-10-15T00:00:00.000Z');
    assert.equal(params.timeMax, '2026-11-18T00:00:00.000Z');
  }
  assert.equal(formatMarkdownExport(events, '2026-10-16', '2026-11-16'), [
    '+ (10/16) Start day',
    '+ (11/16) Holiday',
    '+ (11/16) Late meeting',
  ].join('\n'));
  assert.equal(formatMarkdownExport(events, '2026-11-01', '2026-11-01'), '');
});

test('an error on a subsequent page rejects the entire fetch', async () => {
  const auth = {
    async request({ params }) {
      if (params.pageToken) throw new Error('API unavailable');
      return { data: { nextPageToken: 'page2' } };
    },
  };
  await assert.rejects(
    fetchEventsForExport(auth, [{ id: 'personal' }], '2026-10-16', '2026-11-16'),
    /API unavailable/
  );
});

function timedEvent(summary, start, end) {
  return {
    summary,
    start: { dateTime: new Date(start).toISOString() },
    end: { dateTime: new Date(end).toISOString() },
  };
}
