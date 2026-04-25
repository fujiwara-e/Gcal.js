let hasShownTaskSetupNotice = false;

export function showTaskSetupNotice(logTable) {
  if (!logTable || hasShownTaskSetupNotice) {
    return;
  }

  logTable.log(
    '{yellow-fg}Google Tasks integration is optional. If you want task features, enable the Google Tasks API, delete token.json, and re-authorize.{/yellow-fg}'
  );
  hasShownTaskSetupNotice = true;
}

export function resetTaskSetupNoticeForTest() {
  hasShownTaskSetupNotice = false;
}
