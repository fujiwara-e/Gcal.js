## Markdown出力

### ターミナルから実行

```bash
cldr md
```

1. 上下キーで移動し、Space で出力したいカレンダーをチェックする。Enter で選択を確定する。
2. 開始日と終了日を `YYYY-MM-DD` で確認する。初期値は前月の同日（その日がなければ前月末）から今日まで。入力欄をそのまま Enter で確定するか、入力値を編集する。
3. Google Calendar から指定期間内に始まる予定を取得し、Markdown を標準出力に表示する。開始日と終了日も含む。Esc または Ctrl+C で入力を中止できる。

ファイルに保存する場合も、カレンダーと日付の入力はターミナルで行う。

```bash
cldr md > events.md
```

### TUI 内で実行

表示されている予定を引数に合わせて Markdown で出力する。出力した情報はクリップボードに保存される。

1. 出力したいカレンダを[表示するカレンダの選択](https://github.com/hosokawa-kenshin/Gcal.js/blob/main/docs/cmd/config.md)を用いて選択する．
2. コマンドラインを開き `md yyyy-mm-dd yyyy-mm-dd` と入力し `Enter` キーを押す．
3. `Enter` キーを押し，クリップボードに保存する．
