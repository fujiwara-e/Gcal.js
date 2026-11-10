export function waitForListSelection(list, onSelect, onCancel) {
  const cleanup = () => {
    list.off('select', select);
    list.off('cancel', cancel);
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
}
