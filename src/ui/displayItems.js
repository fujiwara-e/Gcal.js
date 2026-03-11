/**
 * displayItems の生成・検索に関するデータ変換関数群
 * displayItems は { date: Date, event: Event | null, isFirstDay: boolean } の配列
 */

/**
 * イベントを日付ごとに展開してMapに格納する共通処理
 * 複数日イベントは各日に展開され，各日に { event, isFirstDay } の配列が格納される
 * @param {Array} events - イベントの配列
 * @returns {Map} dateKey -> [{ event, isFirstDay }] のマップ
 */
function expandEventsToDateMap(events) {
  const dateEventMap = new Map();

  events.forEach(event => {
    const eventStart = new Date(event.start);
    const eventEnd = new Date(event.end);
    eventStart.setHours(0, 0, 0, 0);
    eventEnd.setHours(0, 0, 0, 0);

    const daysDiff = Math.round(
      (eventEnd.getTime() - eventStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (
      daysDiff === 0 ||
      (daysDiff === 1 &&
        event.start.toTimeString().slice(0, 5) === event.end.toTimeString().slice(0, 5))
    ) {
      const dateKey = eventStart.toLocalISOString().split('T')[0];
      if (!dateEventMap.has(dateKey)) {
        dateEventMap.set(dateKey, []);
      }
      dateEventMap.get(dateKey).push({ event, isFirstDay: true });
    } else {
      const currentDate = new Date(eventStart);
      let isFirst = true;
      while (currentDate < eventEnd) {
        const dateKey = currentDate.toLocalISOString().split('T')[0];
        if (!dateEventMap.has(dateKey)) {
          dateEventMap.set(dateKey, []);
        }
        dateEventMap.get(dateKey).push({ event, isFirstDay: isFirst });
        isFirst = false;
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
  });

  return dateEventMap;
}

/**
 * イベントが存在する日のみのdisplayItemsを作成（findコマンド用）
 * 各displayItemは { date: Date, event: Event, isFirstDay: boolean } の形式
 * 複数日イベントは各日に展開される
 */
export function createDisplayItemsForEvents(events) {
  const displayItems = [];
  const dateEventMap = expandEventsToDateMap(events);

  for (const [dateKey, dayEvents] of dateEventMap) {
    const date = new Date(dateKey + 'T00:00:00');
    dayEvents.forEach(({ event, isFirstDay }) => {
      displayItems.push({ date: new Date(date), event, isFirstDay });
    });
  }

  displayItems.sort((a, b) => a.date - b.date);

  return displayItems;
}

/**
 * 各displayItemは { date: Date, event: Event | null, isFirstDay: boolean } の形式
 * 複数日イベントは各日に展開され，イベントのない日は event: null となる
 */
export function createDisplayItems(events, referenceDate) {
  const displayItems = [];

  const refDate = referenceDate || new Date();
  const startDate = new Date(`${refDate.getFullYear() - 1}-01-01T00:00:00`);
  const endDate = new Date(`${refDate.getFullYear() + 1}-12-31T23:59:00`);

  const dateEventMap = expandEventsToDateMap(events);

  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateKey = currentDate.toLocalISOString().split('T')[0];
    const date = new Date(currentDate);

    if (dateEventMap.has(dateKey)) {
      const dayEvents = dateEventMap.get(dateKey);
      dayEvents.forEach(({ event, isFirstDay }) => {
        displayItems.push({ date: new Date(date), event, isFirstDay });
      });
    } else {
      displayItems.push({
        date: new Date(date),
        event: null,
        isFirstDay: true,
      });
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return displayItems;
}

export function searchDisplayItemIndex(date, displayItems) {
  const searchDate = new Date(date);
  searchDate.setHours(0, 0, 0, 0);
  const searchDateKey = searchDate.toLocalISOString().slice(0, 10);

  for (let i = 0; i < displayItems.length; i++) {
    const itemDate = new Date(displayItems[i].date);
    itemDate.setHours(0, 0, 0, 0);
    const itemDateKey = itemDate.toLocalISOString().slice(0, 10);

    if (itemDateKey === searchDateKey) {
      return i;
    } else if (itemDate > searchDate) {
      return i;
    }
  }

  return displayItems.length > 0 ? displayItems.length - 1 : 0;
}

export function searchDisplayItemIndexOfToday(displayItems) {
  const today = new Date();
  return searchDisplayItemIndex(today, displayItems);
}

/**
 * 去年の予定用 displayItems を生成する
 * 現在の events から前年（today - 1年）を基準に createDisplayItems を呼び出す
 */
export function createLastYearDisplayItems(events) {
  const today = new Date();
  const lastYear = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  return createDisplayItems(events, lastYear);
}
