// 初回読み込み中に出す、画面の骨格に近いスケルトン。
// 速く終わる読み込みでちらつかないよう、CSS で 0.3 秒たってから現れる（globals.css の .skel）。
// 動き（光の流れ）は prefers-reduced-motion: reduce で止まる。

function Wrap({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`skel${className ? ` ${className}` : ""}`} role="status" aria-busy="true">
      <span className="sr-only">読み込み中</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

function Bar({ w, h = 14 }: { w: string; h?: number }) {
  return <span className="skel-bar" style={{ width: w, height: h }} />;
}

function Cover() {
  return (
    <div className="skel-cover-card">
      <span className="skel-block skel-cover" />
      <Bar w="80%" />
      <Bar w="50%" h={10} />
    </div>
  );
}

/** ホーム: 看板 → 評価待ちの帯 → 棚 → 3列 */
export function HomeSkeleton() {
  return (
    <Wrap>
      <span className="skel-block skel-billboard" />
      <span className="skel-block skel-band" />
      <Bar w="40%" h={18} />
      <div className="skel-shelf">
        {[0, 1, 2].map((i) => (
          <Cover key={i} />
        ))}
      </div>
      <Bar w="30%" h={18} />
      <div className="skel-grid">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Cover key={i} />
        ))}
      </div>
    </Wrap>
  );
}

/** 作品のページ: 表紙と題名 → 募集中の枠 → 話の一覧 */
export function ThemeSkeleton() {
  return (
    <Wrap>
      <div className="skel-hero">
        <span className="skel-block skel-hero-cover" />
        <div className="skel-hero-info">
          <Bar w="85%" h={22} />
          <Bar w="55%" />
          <Bar w="40%" h={22} />
        </div>
      </div>
      <Bar w="100%" />
      <Bar w="70%" />
      <span className="skel-block skel-slot" />
      <Bar w="35%" h={18} />
      {[0, 1].map((i) => (
        <div className="skel-row" key={i}>
          <span className="skel-block skel-thumb" />
          <Bar w="30%" />
        </div>
      ))}
    </Wrap>
  );
}

/** 描く: 前のページ → コマ1〜4の入力欄 → 送るボタン */
export function WriteSkeleton() {
  return (
    <Wrap>
      <Bar w="45%" h={20} />
      <span className="skel-block skel-prev" />
      {[0, 1, 2, 3].map((i) => (
        <div className="skel-field" key={i}>
          <Bar w="25%" h={12} />
          <span className="skel-block skel-input" />
        </div>
      ))}
      <span className="skel-block skel-button" />
    </Wrap>
  );
}

/** 評価: 重なったカード → 下のボタン */
export function SwipeSkeleton() {
  return (
    <Wrap>
      <span className="skel-block skel-card" />
      <div className="skel-actions">
        <span className="skel-block skel-round" />
        <span className="skel-block skel-round" />
        <span className="skel-block skel-round" />
      </div>
    </Wrap>
  );
}

/** 読む: 暗い背景にページ画像 */
export function ReaderSkeleton() {
  return (
    <Wrap className="skel-dark">
      <span className="skel-block skel-page" />
      <Bar w="50%" h={12} />
      <span className="skel-block skel-page" />
    </Wrap>
  );
}
