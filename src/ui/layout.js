import blessed from 'blessed';
import { fetchCommandList } from '../services/commandService.js';
import { setupVimKeysForNavigation } from './keyConfig.js';
import {
  createEventDetailTable,
  createEventTable,
  createLastYearTable,
  createLeftTable,
  createLogTable,
} from './table.js';
import { createGraph } from './graph.js';
import {
  createDisplayItems,
  createLastYearDisplayItems,
  searchDisplayItemIndexOfToday,
} from './displayItems.js';
import { formatDisplayItems, formatGroupedEventsDescending } from './displayFormatter.js';
import { updateGraph } from './tableUpdater.js';
import {
  setScreenInstance,
  getScreenInstance,
  getTableReferences,
  saveOriginalLayout,
  handleTerminalResize,
} from './fullscreenManager.js';

export let commandPopup = null;
export let inputBoxHidden = true;

export function removeCommandPopup() {
  const screenInstance = getScreenInstance();
  if (commandPopup && screenInstance) {
    screenInstance.remove(commandPopup);
    commandPopup = null;
    screenInstance.render();
  }
}

export function createLayout(calendars, events) {
  const calendarNames = Array.from(new Set(calendars.map(calendar => calendar.summary)));

  const commands = fetchCommandList();

  const screen = blessed.screen({
    smartCSR: true,
    title: 'Google Calendar Events',
    fullUnicode: true,
  });

  setScreenInstance(screen);

  // ターミナルサイズ変更のイベントリスナーを追加
  screen.on('resize', () => {
    handleTerminalResize();
  });

  const inputBox = blessed.textbox({
    top: 'center',
    left: 'center',
    width: '60%',
    height: 3,
    border: { type: 'line', fg: 'white' },
    label: 'Commandline',
    style: {
      fg: 'white',
    },
    inputOnFocus: true,
    hidden: true,
  });

  inputBox.on('show', () => {
    inputBoxHidden = false;
  });

  inputBox.on('hide', () => {
    inputBoxHidden = true;
    removeCommandPopup();
  });

  inputBox.on('focus', () => {
    if (!inputBoxHidden) {
      setTimeout(() => {
        const currentInput = inputBox.getValue().trim();
        showFilteredCommands(currentInput);
        screen.render();
      }, 10);
    }
  });

  inputBox.on('keypress', (ch, key) => {
    if (key.name === 'escape') {
      if (commandPopup) {
        removeCommandPopup();
      }
      return;
    }

    if (key.name === 'return') {
      inputBoxHidden = true;
      return;
    }

    if (key.name !== 'tab') {
      setTimeout(() => {
        if (!inputBoxHidden) {
          const currentInput = inputBox.getValue().trim();
          showFilteredCommands(currentInput);
        }
      }, 10);
    }
  });

  inputBox.key(['return'], () => {
    removeCommandPopup();
    inputBoxHidden = true;
  });

  inputBox.key(['tab'], () => {
    const currentInput = inputBox.getValue().trim();
    const commands = fetchCommandList();

    const matchingCommands = commands.filter(
      cmd => cmd.startsWith(currentInput) && cmd !== currentInput
    );

    if (matchingCommands.length === 1) {
      inputBox.setValue(matchingCommands[0] + ' ');
      showFilteredCommands(matchingCommands[0] + ' ');
      screen.render();
    } else if (matchingCommands.length > 1) {
      let commonPrefix = currentInput;
      let position = currentInput.length;
      let allSameChar = true;

      while (allSameChar && matchingCommands.every(cmd => cmd.length > position)) {
        const char = matchingCommands[0][position];
        allSameChar = matchingCommands.every(cmd => cmd[position] === char);
        if (allSameChar) {
          commonPrefix += char;
          position++;
        }
      }

      inputBox.setValue(commonPrefix);
      showFilteredCommands(commonPrefix);
      screen.render();
    }
  });

  inputBox.key(['escape'], () => {
    removeCommandPopup();
    inputBox.hide();
    screen.render();
  });

  function showFilteredCommands(input) {
    if (inputBoxHidden) {
      return;
    }

    const commands = fetchCommandList();
    let filteredCommands = commands;

    if (input) {
      filteredCommands = commands.filter(cmd => cmd.startsWith(input));
    }

    if (filteredCommands.length === 0) {
      removeCommandPopup();
      return;
    }

    removeCommandPopup();

    if (!inputBoxHidden) {
      commandPopup = blessed.list({
        parent: screen,
        top: inputBox.top + 3,
        left: inputBox.left,
        width: '40%',
        height: Math.min(filteredCommands.length + 2, 10),
        items: filteredCommands,
        label: 'Command Completion',
        border: { type: 'line', fg: 'cyan' },
        style: {
          fg: 'white',
          bg: 'black',
          selected: { fg: 'black', bg: 'green' },
        },
        keys: true,
        mouse: true,
        scrollable: true,
      });

      commandPopup.on('select', item => {
        inputBox.setValue(item + ' ');
        screen.render();
        inputBox.focus();
      });

      commandPopup.key(['escape'], () => {
        removeCommandPopup();
        screen.render();
        inputBox.focus();
      });

      if (filteredCommands.length > 0) {
        commandPopup.select(0);
      }

      screen.render();
    }
  }

  const list = blessed.list({
    top: 'center',
    left: 'center',
    width: '50%',
    height: '30%',
    items: calendarNames,
    label: 'Calendar List',
    border: { type: 'line', fg: 'yellow' },
    style: {
      fg: 'white',
      bg: 'black',
      selected: { fg: 'black', bg: 'green' },
    },
    hidden: true,
    mouse: true,
    keys: true,
  });

  const editCalendarCommandList = blessed.list({
    top: '50%',
    left: 'center',
    width: '50%',
    height: '20%',
    items: [
      '選択日にイベントを追加',
      'イベントを編集',
      'イベントをコピー',
      'イベントを削除',
      '他のイベントを参照して選択日にコピー',
    ],
    label: 'Edit List',
    border: { type: 'line', fg: 'yellow' },
    style: {
      fg: 'white',
      bg: 'black',
      selected: { fg: 'black', bg: 'green' },
    },
    hidden: true,
    mouse: true,
    keys: true,
  });

  const commandList = blessed.list({
    top: 'center',
    left: 'center',
    width: '50%',
    height: '30%',
    items: commands,
    label: 'Command List',
    border: { type: 'line', fg: 'yellow' },
    style: {
      fg: 'white',
      bg: 'black',
      selected: { fg: 'black', bg: 'green' },
    },
    hidden: true,
    mouse: true,
    keys: true,
  });

  const commandDetailsBox = blessed.box({
    top: 0,
    left: '50%',
    width: '50%',
    height: '100%',
    label: 'Command Details',
    border: { type: 'line', fg: 'cyan' },
    hidden: true,
  });

  const keypressListener = (_, key) => {
    if (key.name === 'j' || key.name === 'k') {
      const currentIndex = leftTable.selected;
      // displayItems構造を使用する場合、eventsの代わりにdisplayItemsから情報を取得
      if (leftTable.displayItems && leftTable.displayItems[currentIndex]) {
        const item = leftTable.displayItems[currentIndex];
        if (item.date.getDay() === 0 || item.date.getDay() === 1) {
          updateGraph(screen, rightGraph, currentIndex, events, leftTable.displayItems);
        }
      }
    }
  };

  const leftTable = createLeftTable(screen);

  const displayItems = createDisplayItems(events, new Date());
  const formattedEvents = formatDisplayItems(displayItems);
  leftTable.displayItems = displayItems;

  const eventTable = createEventTable(screen);
  const currentEvents = formatGroupedEventsDescending(events);
  leftTable.setItems(formattedEvents);
  eventTable.setItems(currentEvents);
  const rightGraph = createGraph(screen);
  leftTable.on('keypress', keypressListener);
  const logTable = createLogTable(screen);
  logTable.log('Welcome to Gcal.js!');
  leftTable.select(searchDisplayItemIndexOfToday(displayItems));
  leftTable.scrollTo(leftTable.selected + leftTable.height - 3);
  updateGraph(screen, rightGraph, leftTable.selected, events, displayItems);
  const eventDetailTable = createEventDetailTable(screen);

  // 去年の予定テーブルを生成・初期化
  const lastYearTable = createLastYearTable(screen);
  const lastYearDisplayItems = createLastYearDisplayItems(events);
  const formattedLastYearEvents = formatDisplayItems(lastYearDisplayItems);
  lastYearTable.displayItems = lastYearDisplayItems;
  lastYearTable.setItems(formattedLastYearEvents);

  screen.append(inputBox);
  screen.append(list);
  screen.append(editCalendarCommandList);
  screen.append(commandList);
  screen.append(commandDetailsBox);
  screen.append(eventDetailTable);
  setupVimKeysForNavigation(leftTable, screen, null, lastYearTable);
  setupVimKeysForNavigation(list, screen, null, null);
  setupVimKeysForNavigation(commandList, screen, null, null);
  setupVimKeysForNavigation(editCalendarCommandList, screen, null, null);
  setupVimKeysForNavigation(eventTable, screen, null, null);
  setupVimKeysForNavigation(lastYearTable, screen, leftTable, null);

  // テーブル参照の初期化と元のレイアウト情報の保存
  leftTable.tableId = 'leftTable';
  rightGraph.tableId = 'rightGraph';
  logTable.tableId = 'logTable';
  lastYearTable.tableId = 'lastYearTable';

  const tableRefs = getTableReferences();
  tableRefs.leftTable = leftTable;
  tableRefs.rightGraph = rightGraph;
  tableRefs.logTable = logTable;
  tableRefs.lastYearTable = lastYearTable;

  saveOriginalLayout(leftTable, 'leftTable');
  saveOriginalLayout(rightGraph, 'rightGraph');
  saveOriginalLayout(logTable, 'logTable');
  saveOriginalLayout(lastYearTable, 'lastYearTable');

  leftTable.focus();
  leftTable.key(['space'], () => {
    inputBox.show();
    inputBox.focus();
    screen.render();
  });
  console.log('Create Layout');
  return { screen, inputBox, keypressListener, lastYearTable };
}
