export function sortItemsByStart(items) {
  return items.sort((a, b) => {
    if (!a.start && !b.start) return 0;
    if (!a.start) return 1;
    if (!b.start) return -1;
    return a.start - b.start;
  });
}

export function filterDisplayableItems(items, referenceDate = new Date()) {
  return items.filter(item => {
    if (!item.start) {
      return false;
    }

    return (
      item.start.getFullYear() === referenceDate.getFullYear() ||
      item.start.getFullYear() === referenceDate.getFullYear() + 1 ||
      item.start.getFullYear() === referenceDate.getFullYear() - 1
    );
  });
}
