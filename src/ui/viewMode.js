/**
 * 去年ビュー・降順ビューの切替ロジック
 */
import { createLastYearDisplayItems, createDisplayItemsForEvents, searchDisplayItemIndex } from './displayItems.js';
import { formatDisplayItems } from './displayFormatter.js';
import {
  getTableReferences,
  getScreenInstance,
  isLastYearViewActive,
  setLastYearViewActive,
  isRecentDescViewActive,
  setRecentDescViewActive,
  getLastYearSortOrder,
  setLastYearSortOrder,
} from './fullscreenManager.js';

/**
 * 去年の予定ビューと通常ビュー（グラフ+ログ）をトグルする
 * @param {object} screen - blessed screen
 * @param {Array} events - イベント配列（現在表示用）
 * @param {Array} allEvents - 全イベント配列（去年パネルのリセットに使用）
 */
export function toggleLastYearView(screen, events, allEvents) {
  const tableReferences = getTableReferences();
  const screenInstance = getScreenInstance();
  const rightGraph = tableReferences.rightGraph;
  const logTable = tableReferences.logTable;
  const lastYearTable = tableReferences.lastYearTable;

  if (!lastYearTable) return;

  if (!isLastYearViewActive()) {
    // recentDesc ビューが開いていれば先に閉じる
    if (isRecentDescViewActive()) {
      setRecentDescViewActive(false);
      setLastYearSortOrder('asc');
      lastYearTable.hide();
    }
    // Last Year ビューに切り替え：allEvents を使って全去年イベントで再初期化（検索状態リセット）
    const sourceEvents = allEvents || events;
    const lastYearDisplayItems = createLastYearDisplayItems(sourceEvents);
    lastYearTable.displayItems = lastYearDisplayItems;
    lastYearTable.setItems(formatDisplayItems(lastYearDisplayItems));
    lastYearTable.setLabel('Last Year Events ↑');

    rightGraph.hide();
    logTable.hide();
    lastYearTable.show();
    lastYearTable.focus();
    setLastYearViewActive(true);

    // 左テーブルの選択日と同期（-1年の日付に移動）
    const leftTable = tableReferences.leftTable;
    if (leftTable && leftTable.displayItems && lastYearTable.displayItems) {
      const selectedItem = leftTable.displayItems[leftTable.selected];
      if (selectedItem) {
        const targetDate = new Date(selectedItem.date);
        targetDate.setFullYear(targetDate.getFullYear() - 1);
        const idx = searchDisplayItemIndex(targetDate, lastYearTable.displayItems);
        lastYearTable.select(idx);
        lastYearTable.scrollTo(idx + Math.floor(lastYearTable.height / 2));
      }
    }
  } else {
    // グラフ/ログビューに戻す
    lastYearTable.hide();
    rightGraph.show();
    logTable.show();
    setLastYearViewActive(false);
    setLastYearSortOrder('asc');
  }

  if (screenInstance) {
    screenInstance.render();
  }
}

/**
 * 現在日時から降順で全イベントを右パネルに表示するビューをトグルする
 * @param {object} screen - blessed screen
 * @param {Array} events - イベント配列
 * @param {Array} allEvents - 全イベント配列
 */
export function toggleCurrentDescView(screen, events, allEvents) {
  const tableReferences = getTableReferences();
  const screenInstance = getScreenInstance();
  const rightGraph = tableReferences.rightGraph;
  const logTable = tableReferences.logTable;
  const lastYearTable = tableReferences.lastYearTable;

  if (!lastYearTable) return;

  if (!isRecentDescViewActive()) {
    // lastYear ビューが開いていれば先に閉じる
    if (isLastYearViewActive()) {
      setLastYearViewActive(false);
    }
    setLastYearSortOrder('desc');

    // 全イベントを降順で表示（今日以前のイベントを最近順に）
    const sourceEvents = allEvents || events;
    const displayItems = createDisplayItemsForEvents(sourceEvents);
    displayItems.sort((a, b) => b.date - a.date);
    lastYearTable.displayItems = displayItems;
    lastYearTable.setItems(formatDisplayItems(displayItems));
    lastYearTable.setLabel('Recent Events ↓');

    rightGraph.hide();
    logTable.hide();
    lastYearTable.show();
    lastYearTable.focus();
    setRecentDescViewActive(true);

    // 今日の日付に近いアイテムにスクロール
    const today = new Date();
    const idx = displayItems.findIndex(item => item.date <= today);
    const scrollIdx = idx >= 0 ? idx : 0;
    lastYearTable.select(scrollIdx);
    lastYearTable.scrollTo(scrollIdx + Math.floor(lastYearTable.height / 2));
  } else {
    // グラフ/ログビューに戻す
    lastYearTable.hide();
    rightGraph.show();
    logTable.show();
    setRecentDescViewActive(false);
    setLastYearSortOrder('asc');
  }

  if (screenInstance) {
    screenInstance.render();
  }
}

/**
 * 去年の予定テーブルのソートを適用して再描画する
 * @param {object} lastYearTable - blessed list table
 * @param {object} screen - blessed screen
 * @param {string} [labelSuffix] - ラベルに追加するサフィックス（例: "(5 results)"）
 */
export function applyLastYearSort(lastYearTable, screen, labelSuffix) {
  if (!lastYearTable || !lastYearTable.displayItems) return;

  const lastYearSortOrder = getLastYearSortOrder();

  if (lastYearSortOrder === 'desc') {
    lastYearTable.displayItems.sort((a, b) => b.date - a.date);
  } else {
    lastYearTable.displayItems.sort((a, b) => a.date - b.date);
  }

  const arrow = lastYearSortOrder === 'asc' ? '↑' : '↓';
  const suffix = labelSuffix ? ` ${labelSuffix}` : '';
  lastYearTable.setLabel(`Last Year Events ${arrow}${suffix}`);
  lastYearTable.setItems(formatDisplayItems(lastYearTable.displayItems));
  screen.render();
}
