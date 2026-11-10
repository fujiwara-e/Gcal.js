export function createCalendarChoices(calendars) {
  const nameCounts = new Map();
  for (const { summary } of calendars) {
    nameCounts.set(summary, (nameCounts.get(summary) || 0) + 1);
  }

  return calendars.map(({ id, summary }) => ({
    id,
    label: summary && nameCounts.get(summary) > 1 ? `${summary} (${id})` : summary || id,
  }));
}

export function setCalendarChoices(list, calendars) {
  const choices = createCalendarChoices(calendars);
  list.setItems(choices.map(choice => choice.label));
  return choices;
}
