export function formatMarkdownEvents(events) {
  return events
    .map(({ start, summary }) => `+ (${start.getMonth() + 1}/${start.getDate()}) ${summary}`)
    .join('\n');
}
