"use client";
// ホーム: 看板 → 評価待ちの帯 → 棚「連載中」→ 棚「完結した話がある作品」→ 全作品3列
import Link from "next/link";
import { listThemes, peekThemes } from "@/lib/client/api";
import { displayTitle, textHead, type ThemeSummary } from "@/lib/apiTypes";
import { CoverCard } from "./CoverCard";
import { useDeckCount, useLoad } from "./hooks";
import { PageImage } from "./PageImage";
import { HomeSkeleton } from "./Skeleton";

function Shelf({ title, themes }: { title: string; themes: ThemeSummary[] }) {
  if (themes.length === 0) return null;
  return (
    <section className="shelf">
      <h2 className="section-title">{title}</h2>
      <div className="shelf-row">
        {themes.map((t) => (
          <CoverCard key={t.id} theme={t} />
        ))}
      </div>
    </section>
  );
}

export function HomeClient() {
  const { data: themes, error, reload } = useLoad(listThemes, peekThemes(), "home");
  const deckCount = useDeckCount();

  if (error && !themes) {
    return (
      <div className="error">
        <p>{error}</p>
        <button type="button" className="btn btn-small btn-ghost" onClick={() => void reload()}>
          もう一度読む
        </button>
      </div>
    );
  }
  if (!themes) return <HomeSkeleton />;

  const byUpdate = [...themes].sort((a, b) => b.updatedAt - a.updatedAt);
  // 看板は絵のある作品を優先する（まだ絵の無い作品が一番上だと灰色の箱になるため）
  const top = byUpdate.find((t) => t.coverUrl) ?? byUpdate[0];
  const completed = byUpdate.filter((t) => t.completedEpisodes > 0);

  return (
    <>
      {top ? (
        <Link href={`/t/${top.id}`} className="billboard">
          <PageImage src={top.coverUrl} alt={`${displayTitle(top)}の表紙`} className="billboard-img" eager />
          <span className="billboard-text">
            <span className="billboard-tag">いま一番動いている作品</span>
            <span className="billboard-title">{displayTitle(top)}</span>
            {!top.title && <span className="billboard-sub">{textHead(top.text)}</span>}
            <span className="billboard-sub">第{top.slot.episode}話 募集中</span>
          </span>
        </Link>
      ) : (
        <div className="empty-box">
          <p>まだ作品がありません。最初の作品を始めてみよう。</p>
          <Link href="/new" className="btn">
            作品を始める
          </Link>
        </div>
      )}

      {deckCount !== null && deckCount > 0 && (
        <Link href="/swipe" className="deck-band">
          <span>
            評価待ち <b>{deckCount >= 20 ? "20+" : deckCount}枚</b>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      )}

      <Shelf title="連載中" themes={byUpdate.slice(0, 12)} />
      <Shelf title="完結した話がある作品" themes={completed} />

      {themes.length > 0 && (
        <section>
          <h2 className="section-title">全作品</h2>
          <div className="cover-grid">
            {themes.map((t) => (
              <CoverCard key={t.id} theme={t} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
