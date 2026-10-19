// Import only the APIs we use; the package root loads every Google API.
export {
  calendar as createCalendarClient,
  auth as googleAuth,
} from 'googleapis/build/src/apis/calendar/index.js';
export { tasks as createTasksClient } from 'googleapis/build/src/apis/tasks/index.js';
