/**
 * 全画面表示・リサイズ・テーブル表示状態の管理
 */

// 全画面表示状態管理
let currentDisplayMode = 'split'; // 'split', 'fullscreen1', 'fullscreen2', 'fullscreen3'
let originalLayouts = {}; // 各テーブルの元の位置・サイズ情報
let tableReferences = {}; // テーブル参照を保持
let lastYearViewActive = false; // 去年の予定ビュー表示状態
let lastYearSortOrder = 'asc'; // 去年の予定テーブルのソート順 ('asc' or 'desc')
let recentDescViewActive = false; // 現在日時から降順ビュー表示状態
let _screenInstance = null; // screen参照（layout.jsからsetScreenInstanceで設定）

export function setScreenInstance(screen) {
  _screenInstance = screen;
}

export function getScreenInstance() {
  return _screenInstance;
}

export function getTableReferences() {
  return tableReferences;
}

export function isLastYearViewActive() {
  return lastYearViewActive;
}

export function setLastYearViewActive(active) {
  lastYearViewActive = active;
}

export function isRecentDescViewActive() {
  return recentDescViewActive;
}

export function setRecentDescViewActive(active) {
  recentDescViewActive = active;
}

export function getLastYearSortOrder() {
  return lastYearSortOrder;
}

/**
 * 去年の予定テーブルのソート順を設定する
 * @param {'asc'|'desc'|undefined} order - 'asc'/'desc' で固定，undefined でトグル
 */
export function setLastYearSortOrder(order) {
  if (order === 'asc' || order === 'desc') {
    lastYearSortOrder = order;
  } else {
    lastYearSortOrder = lastYearSortOrder === 'asc' ? 'desc' : 'asc';
  }
}

export function saveOriginalLayout(table, tableId) {
  originalLayouts[tableId] = {
    top: table.top,
    left: table.left,
    width: table.width,
    height: table.height,
    hidden: table.hidden,
  };
}

// デフォルトレイアウトを再計算する関数
export function recalculateDefaultLayouts() {
  const defaultLayouts = {
    leftTable: {
      top: 0,
      left: 0,
      width: '50%',
      height: '100%',
      hidden: false,
    },
    rightGraph: {
      top: 0,
      left: '50%',
      width: '50%',
      height: '80%',
      hidden: false,
    },
    logTable: {
      top: '80%',
      left: '50%',
      width: '50%',
      height: '22%',
      hidden: false,
    },
    lastYearTable: {
      top: 0,
      left: '50%',
      width: '50%',
      height: '100%',
      hidden: true,
    },
  };

  // originalLayoutsを新しいデフォルト値で更新
  Object.keys(defaultLayouts).forEach(tableId => {
    if (originalLayouts[tableId]) {
      originalLayouts[tableId] = { ...defaultLayouts[tableId] };
    }
  });
}

// ターミナルサイズ変更時のレイアウト更新
export function handleTerminalResize() {
  if (currentDisplayMode === 'split') {
    // 3分割表示の場合、デフォルトレイアウトを再計算して適用
    recalculateDefaultLayouts();
    Object.keys(tableReferences).forEach(tableId => {
      const table = tableReferences[tableId];
      const layout = originalLayouts[tableId];
      if (table && layout) {
        table.top = layout.top;
        table.left = layout.left;
        table.width = layout.width;
        table.height = layout.height;
        // hidden は lastYearViewActive の状態に従って設定する（layout.hidden は使わない）
      }
    });
    // hidden 状態を現在のビューモードに合わせて再適用
    showAllTables();
    if (_screenInstance) {
      _screenInstance.render();
    }
  }
  // 全画面表示の場合は何もしない（既に100%なので自動調整される）
}

export function resizeTable(table, fullscreen) {
  if (fullscreen) {
    table.top = 0;
    table.left = 0;
    table.width = '100%';
    table.height = '100%';
  } else {
    const original = originalLayouts[table.tableId];
    if (original) {
      table.top = original.top;
      table.left = original.left;
      table.width = original.width;
      table.height = original.height;
    }
  }
}

export function hideOtherTables(activeTableId) {
  Object.keys(tableReferences).forEach(tableId => {
    if (tableId !== activeTableId) {
      tableReferences[tableId].hidden = true;
    }
  });
}

export function showAllTables() {
  Object.keys(tableReferences).forEach(tableId => {
    // lastYearTable は lastYearViewActive のときのみ表示する
    if (tableId === 'lastYearTable') {
      tableReferences[tableId].hidden = !lastYearViewActive;
    } else if (tableId === 'rightGraph' || tableId === 'logTable') {
      tableReferences[tableId].hidden = lastYearViewActive;
    } else {
      tableReferences[tableId].hidden = false;
    }
  });
}

export function toggleFullscreen(tableIndex) {
  // Last Year ビュー表示中は rightGraph の代わりに lastYearTable を tableIndex=2 として扱う
  const tableIds = lastYearViewActive
    ? ['leftTable', 'lastYearTable', 'logTable']
    : ['leftTable', 'rightGraph', 'logTable'];

  // escapeキーの場合（tableIndex = 0）、3分割表示に戻る
  if (tableIndex === 0) {
    if (currentDisplayMode !== 'split') {
      showAllTables();
      Object.keys(tableReferences).forEach(tableId => {
        resizeTable(tableReferences[tableId], false);
      });
      currentDisplayMode = 'split';
      if (_screenInstance) {
        _screenInstance.render();
      }
    }
    return;
  }

  const targetTableId = tableIds[tableIndex - 1];

  if (!targetTableId || !tableReferences[targetTableId]) {
    return;
  }

  const targetDisplayMode = `fullscreen${tableIndex}`;

  if (currentDisplayMode === targetDisplayMode) {
    // 全画面表示から3分割表示に戻る
    showAllTables();
    Object.keys(tableReferences).forEach(tableId => {
      resizeTable(tableReferences[tableId], false);
    });
    currentDisplayMode = 'split';
  } else {
    // 3分割表示または他の全画面表示から指定されたテーブルの全画面表示に切り替え
    showAllTables(); // まず全て表示
    Object.keys(tableReferences).forEach(tableId => {
      resizeTable(tableReferences[tableId], false); // 元のサイズに戻す
    });

    // 指定されたテーブルを全画面表示
    resizeTable(tableReferences[targetTableId], true);
    hideOtherTables(targetTableId);
    tableReferences[targetTableId].hidden = false;
    currentDisplayMode = targetDisplayMode;
  }

  if (_screenInstance) {
    _screenInstance.render();
  }
}
