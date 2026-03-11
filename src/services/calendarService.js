import Event from '../models/event.js';
import fs2 from 'fs';
import { google } from 'googleapis';
import {
  insertCalendarListToDatabase,
  fetchCalendarsFromDatabase,
  setSyncTokenInDatabase,
  ensureDescriptionColumn,
  deleteEventsFromDatabase,
  insertEventsToDatabase,
  fetchEventsFromDatabase,
} from './databaseService.js';
import { convertToDateTime } from '../utils/dateUtils.js';

/**
 * Fetch all calendar which the user can access to.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
export async function fetchCalendars(auth) {
  const calendar = google.calendar({ version: 'v3', auth });
  const res = await calendar.calendarList.list();
  const calendars = res.data.items;
  return calendars;
}

/**
 * Lists events on specified calendars within a given date range.
 *
 * @param {google.calendar_v3.Calendar} client The google API client.
 * @param {Date} startTime The start date of fetching events.
 * @param {Date} endtime The end date of fetching events.
 * @param {Object} calendar The set of calendar ID and summary.
 * @return {Promise<Array[Event]>} List of events.
 */
export async function fetchEventFromCalendar(client, calendar) {
  const params = {
    calendarId: calendar.id,
    singleEvents: true,
    maxResults: 2500,
  };
  if (calendar.syncToken !== null) {
    params.syncToken = calendar.syncToken;
  }
  try {
    const res = await client.events.list(params);
    const events = res.data.items;
    if (res.data.nextSyncToken) {
      calendar.syncToken = res.data.nextSyncToken;
      await setSyncTokenInDatabase(calendar);
      const deletedEvents = res.data.items.filter(event => event.status === 'cancelled');
      await deleteEventsFromDatabase(deletedEvents);
      const validEvents = events.filter(event => event.status === 'confirmed');
      return validEvents.map(event => Event.fromGAPIEvent(event, calendar.id, calendar.summary));
    }
    return events.map(event => Event.fromGAPIEvent(event, calendar.id, calendar.summary));
  } catch (err) {
    if (err.code === 410) {
      const allRequestParams = {
        calendarId: calendar.id,
        singleEvents: true,
        maxResults: 2500,
      };
      const allRes = await client.events.list(allRequestParams);
      if (allRes.data.nextSyncToken) {
        calendar.syncToken = allRes.data.nextSyncToken;
        await setSyncTokenInDatabase(calendar);
      }
      const allEvents = allRes.data.items;
      return allEvents.map(event => Event.fromGAPIEvent(event, calendar.id, calendar.summary));
    }
    console.error('The API returned an error: ' + err);
  }
}

/**
 * Lists events on specified calendars within a given date range.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {Array<String>?} calendarIDs IDs of calendars to fetch events. If not specified, fetch events from all calendars.
 * @param {Date} startTime The start date of fetching events.
 * @param {Date} endtime The end date of fetching events.
 * @return {Promise<Array[Event]>} List of events.
 */
export async function fetchEvents(auth, calendars) {
  const client = google.calendar({ version: 'v3', auth });
  let tasks = [];
  for (const calendar of calendars) {
    const task = fetchEventFromCalendar(client, calendar);
    tasks.push(task);
  }

  const events = await Promise.all(tasks);
  return events.flat();
}

export async function initializeCalendars(auth) {
  const dbPath = './db/Gcal.db';
  var calendars = [];
  if (!fs2.existsSync(dbPath)) {
    console.log('Database file does not exist. Creating a new database...');
    calendars = await fetchCalendars(auth);
    await insertCalendarListToDatabase(calendars);
    calendars = await fetchCalendarsFromDatabase();
  } else {
    ensureDescriptionColumn();
    calendars = await fetchCalendarsFromDatabase();
  }
  return calendars;
}

export async function initializeEvents(auth, calendars) {
  console.log('Fetching events...');
  const rawEvents = await fetchEvents(auth, calendars);
  await insertEventsToDatabase(rawEvents);
  const events = await fetchEventsFromDatabase(calendars);
  return events;
}

export async function fetchSelectedEventsFromDatabase(calendars, startDate, endDate) {
  const events = await fetchEventsFromDatabase(calendars);
  const selectedEvents = events.filter(
    event => event.start >= convertToDateTime(startDate) && event.end <= convertToDateTime(endDate)
  );
  return selectedEvents;
}
