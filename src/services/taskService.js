import { google } from 'googleapis';
import Task from '../models/task.js';
import {
  replaceTasksInDatabase,
  fetchTasksFromDatabase,
} from './databaseService.js';

function createTasksClient(auth) {
  return google.tasks({ version: 'v1', auth });
}

export async function fetchTaskLists(auth) {
  const tasksClient = createTasksClient(auth);
  const res = await tasksClient.tasklists.list();
  return res.data.items || [];
}

export async function fetchTasks(auth) {
  const tasksClient = createTasksClient(auth);
  const taskLists = await fetchTaskLists(auth);
  const taskPromises = taskLists.map(async taskList => {
    const res = await tasksClient.tasks.list({
      tasklist: taskList.id,
      showCompleted: true,
      showHidden: true,
      showDeleted: false,
    });

    const items = res.data.items || [];
    return items.map(task => Task.fromGAPITask(task, taskList.id, taskList.title));
  });

  const tasks = await Promise.all(taskPromises);
  return tasks.flat();
}

export async function initializeTasks(auth) {
  const rawTasks = await fetchTasks(auth);
  await replaceTasksInDatabase(rawTasks);
  return fetchTasksFromDatabase();
}

export async function toggleTaskCompletion(auth, task) {
  const tasksClient = createTasksClient(auth);
  const nextStatus = task.isCompleted() ? 'needsAction' : 'completed';
  const requestBody = {
    id: task.id,
    title: task.title,
    notes: task.notes,
    status: nextStatus,
  };

  if (task.due) {
    requestBody.due = task.getDueISOString();
  }

  if (nextStatus === 'completed') {
    requestBody.completed = new Date().toISOString();
  }

  const res = await tasksClient.tasks.update({
    tasklist: task.taskListId,
    task: task.id,
    requestBody,
  });

  return Task.fromGAPITask(res.data, task.taskListId, task.taskListName);
}

export async function createTask(auth, taskListId, taskListName, values) {
  const tasksClient = createTasksClient(auth);
  const requestBody = {
    title: values.title,
    notes: values.description || '',
  };

  if (values.date) {
    requestBody.due = `${values.date}T00:00:00.000Z`;
  }

  const res = await tasksClient.tasks.insert({
    tasklist: taskListId,
    requestBody,
  });

  return Task.fromGAPITask(res.data, taskListId, taskListName);
}

export async function deleteTask(auth, task) {
  const tasksClient = createTasksClient(auth);

  await tasksClient.tasks.delete({
    tasklist: task.taskListId,
    task: task.id,
  });
}
