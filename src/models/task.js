export class Task {
  constructor(
    id,
    title,
    notes,
    due,
    status,
    completed,
    taskListId,
    taskListName
  ) {
    this.id = id;
    this.title = title || '';
    this.notes = notes || '';
    this.due = due instanceof Date || due === null ? due : parseTaskDue(due);
    this.status = status || 'needsAction';
    this.completed = completed;
    this.taskListId = taskListId;
    this.taskListName = taskListName || 'Tasks';
    this.source = 'tasks';
    this.itemType = 'task';
  }

  static fromGAPITask(task, taskListId, taskListName) {
    return new Task(
      task.id,
      task.title || '',
      task.notes || '',
      parseTaskDue(task.due),
      task.status || 'needsAction',
      task.completed ? new Date(task.completed) : null,
      taskListId,
      taskListName
    );
  }

  get start() {
    return this.due;
  }

  get end() {
    return this.due;
  }

  get summary() {
    return this.title;
  }

  get description() {
    return this.notes;
  }

  get calendarName() {
    return this.taskListName;
  }

  isTask() {
    return true;
  }

  isCompleted() {
    return this.status === 'completed';
  }

  getDisplayType() {
    return 'Task';
  }

  includes(keyword) {
    const dueStr = this.due ? `${this.due.getMonth() + 1}/${this.due.getDate()}` : '';
    return dueStr.includes(keyword) || this.title.includes(keyword);
  }

  getDueISOString() {
    return formatTaskDue(this.due);
  }
}

export default Task;

function parseTaskDue(value) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatTaskDue(date) {
  if (!date) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T00:00:00.000Z`;
}
