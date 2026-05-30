WebFitTimer 開発・実装指示書
プロジェクト概要
筋力トレーニングのメニュー管理と、1レップ単位の動作時間を管理できる専用タイマーを備えたシングルページアプリケーション（SPA）を開発する。

web-fit-timer/
├── index.html
├── style.css
├── app.js
└── menu.json (初期データ)

1. データアーキテクチャと永続化
データフロー
アプリ起動時、localStorage から webFitTimerData を取得する。

データが存在しない場合のみ、外部ファイル data/menu.json を fetch() で読み込み、localStorage に保存して初期化する。

ユーザーが画面上で重量やセット数を変更した際は、即座に localStorage を上書き保存する。

menu.json のデータ構造
以下の構造を基準としてパース・UI生成を行うこと。

{
  "routines": {
    "monday": {
      "dayName": "月曜：胸＋上腕三頭筋",
      "exercises": [
        {
          "id": "dumbbell_floor_press",
          "name": "ダンベルフロアプレス",
          "useDumbbell": true,
          "weight": 15.0,
          "sets": 3,
          "reps": 10,
          "timers": {
            "prep": 30,
            "repDuration": 4, 
            "interval": 60,
            "cooldown": 90
          }
        },
        {
          "id": "wall_pushup",
          "name": "壁プッシュアップ",
          "useDumbbell": false,
          "weight": 0,
          "sets": 3,
          "reps": 10,
          "timers": {
            "prep": 30,
            "repDuration": 10,
            "interval": 60,
            "cooldown": 90
          }
        }
      ]
    }
  }
}

2. コア機能とUI要件
A. メニュー選択・詳細表示エリア
デイリー選択: 曜日（Monday〜Sunday）を選択し、該当する dayName と exercises のリストを展開する。

詳細エディタ: 選択された種目の「セット数」「1セットあたりの回数（reps）」を表示。

重量調整: useDumbbell が true の場合のみ、重量の表示と「＋ / －」ボタン（1kgまたは0.5kg刻み）を表示。操作した値は自動で localStorage に保存されること。

B. 高機能タイマー（ステートマシン）
1つの種目に対し、以下の状態（フェーズ）を順番に遷移させるロジックを実装すること。

PREP (準備): timers.prep 秒のカウントダウン。

WORK (動作中): timers.repDuration 秒 × reps 回のカウント。

UI要件: 全体の残り時間だけでなく、「現在何レップ目か」と「1レップ中の進行度」が視覚的にわかるプログレスバーまたはテキスト表示を実装する。

INTERVAL (インターバル): timers.interval 秒のカウントダウン。

インターバル終了後、残りのセットがあれば 2. WORK へ戻る。

COOLDOWN (クールダウン): 最終セット終了後、timers.cooldown 秒のカウントダウン。終了後、次の種目へ自動または手動で遷移。

C. タイマー操作コントローラー
タイマー領域の近くに以下のマウス操作可能なボタンを配置すること。

Play / Pause: タイマーの一時停止・再開（requestAnimationFrame または setInterval のクリアと再発火）。

Next Set: 現在のフェーズ（WORKやINTERVALなど）を強制終了し、次のセットの WORK へスキップする。

Next Exercise: 現在の種目を強制終了し、リストの次の種目の PREP へスキップする。

3. その他の要件
エクスポート機能: 現在の localStorage の内容を menu_backup.json としてローカルPCにダウンロードできるボタンを設置すること。

UIデザイン: 余計な装飾は避け、PCモニターで少し離れた位置からでもタイマーの残り秒数や現在のフェーズ（色が切り替わるなど）が判別しやすい視認性の高いデザインにすること。
