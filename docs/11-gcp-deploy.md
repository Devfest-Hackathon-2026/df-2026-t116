# 11 GCP デプロイ手順（Cloud Run / Firebase）

スタックに依存しない共通手順。対象は Cloud Run、Firebase Hosting、Firebase App Hosting。
プロジェクト固有の値はすべてプレースホルダ（`YOUR_PROJECT_ID` など）。実際の値はコミットしない。

この文書は手順の説明だけ。実リソースはここでは作らない。作るのは人がコンソールで設定してから。

## 1. 課金ガードレール（最初にやる・必須）

デプロイより前に、次をすべて設定する。設定が終わるまでデプロイしない。

| 対象 | 上限 | 備考 |
|---|---|---|
| プロジェクト全体の予算（kill switch） | **¥3,000** で自動停止 | 予算の通知だけでは止まらない。自動停止は通知を受けて請求先のリンクを外す仕組みが必要 |
| Cloud Run | 支出上限 **¥1,000** | 予算の対象サービスとして個別に設定する |
| Cloud Run functions | 支出上限 **¥1,000** | Cloud Functions を使う場合のみ |
| Vertex AI | 支出上限 **¥1,000** | 使う場合のみ |
| Gemini API | 支出上限 **¥1,000** | API のクォータ（1 日あたりの上限）でも絞る |

### Cloud Run の設定

- `max-instances` は **1〜3**。
- `min-instances` は **0**（待機インスタンスを置かない）。
- 例（値は必ず置き換える）:

```sh
gcloud run deploy YOUR_SERVICE_NAME \
  --source . \
  --project YOUR_PROJECT_ID \
  --region YOUR_REGION \
  --max-instances 3 \
  --min-instances 0 \
  --set-secrets GEMINI_API_KEY=YOUR_SECRET_NAME:latest
```

### 避けるもの

- **Compute Engine**（止め忘れると課金が続く。チームの課金上限の外）
- **GKE**（同じく上限の外）
- **Cloud Storage の大量利用**（データ量に上限がない）
- **BigQuery**（スキャン量に上限がない）
- 上記のように、使った分だけ青天井になりやすいサービス全般

### 請求先のリンクをロックしない

請求先アカウントのリンクを解除できなくなる設定（組織ポリシーや権限のロック）はしない。
kill switch は請求先のリンクを外して止める仕組みなので、外せないと止められない。

## 2. GCP コンソールでの予算設定チェックリスト

人がコンソールで行う。権限のある 1 人が担当する。

- [ ] 請求先アカウントの通貨を確認する（円でない場合は換算額で設定する）
- [ ] 予算を作る: 対象プロジェクト、金額 ¥3,000、しきい値（50% / 90% / 100%）で通知
- [ ] 通知の宛先に、チームで見る人のメールを入れる
- [ ] kill switch の方法を決める（通知を受けて手動で請求先を外す、または Pub/Sub 経由の自動化）
- [ ] Cloud Run の支出上限 ¥1,000 を設定する
- [ ] Gemini API / Vertex AI のクォータを確認し、1 日の上限を決めて設定する
- [ ] 請求ダッシュボードで、今日の見込み額を確認する
- [ ] 上の設定が終わったら、このチェックリストの横にメモを残す（日付と担当）

## 3. Firebase Hosting（静的な画面）

```sh
firebase login
firebase use YOUR_PROJECT_ID
firebase deploy --only hosting
```

- 公開先の URL は、デプロイ後に表示されたものを README に書く。

## 4. Firebase App Hosting（Git 連携）

- コンソールの App Hosting で、リポジトリとブランチを接続する。
- スケールの上限（最大インスタンス数）は 1〜3 に設定する。
- 秘密情報は Secret Manager に置き、バックエンドに紐づける（[docs/12](12-secrets.md)）。

## 5. デプロイ後の確認

- [ ] README のデプロイ URL を更新する（PR 経由）
- [ ] 公開 URL を開き、主要な 1 操作が動く
- [ ] 請求ダッシュボードで、デプロイ直後の額が上限より十分小さい
- [ ] ログに秘密情報が出ていない

## 参考

- 秘密情報: [docs/12-secrets.md](12-secrets.md)
- 締切と提出: [docs/13-demo-and-submission.md](13-demo-and-submission.md)
