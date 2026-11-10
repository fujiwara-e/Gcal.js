const pendingSelections = new WeakMap();

export function waitForListSelection(list, onSelect, onCancel) {
  pendingSelections.get(list)?.();
  const cleanup = () => {
    list.off('select', select);
    list.off('cancel', cancel);
    pendingSelections.delete(list);
  };
  const select = (item, index) => {
    cleanup();
    return onSelect(item, index);
  };
  const cancel = () => {
    cleanup();
    onCancel();
  };

  list.on('select', select);
  list.on('cancel', cancel);
  pendingSelections.set(list, cleanup);
}
