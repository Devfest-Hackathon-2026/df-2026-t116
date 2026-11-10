"use client";
// 読む画面: 暗い背景にその話のページを縦に並べる。タップで上下の帯が出入りする。
import Link from "next/link";
import { useEffect, useState } from "react";
import { PAGES_PER_EPISODE, displayTitle, type ThemeDetail2 } from "@/lib/apiTypes";
import { getTheme, peekTheme } from "@/lib/client/api";
import { markEpisodeRead, useLoad } from "./hooks";
import { Lines } from "./Lines";
import { PageImage } from "./PageImage";
import { ReaderSkeleton } from "./Skeleton";

export function ReaderClient({ themeId, episode }: { themeId: string; episode: number }) {
  const { data, error, status, reload } = useLoad<ThemeDetail2>(
    () => getTheme(themeId),
    peekTheme(themeId),
    themeId,
  );
  const [bars, setBars] = useState(true);

  const pages = (data?.pages ?? []).filter((p) => p.episode === episode).sort((a, b) => a.index - b.index);

  useEffect(() => {
    if (pages.length > 0) markEpisodeRead(themeId, episode);
  }, [themeId, episode, pages.length]);

  const title = data ? displayTitle(data.theme) : "";
  const lastEp = data ? Math.max(0, ...data.pages.map((p) => p.episode)) : 0;
  const complete = pages.length === PAGES_PER_EPISODE;
  const hasNext = episode < lastEp;
  const recruiting = !!data && !hasNext;

  // 画面のタップで帯を出し入れする。リンク・ボタン・セリフの開け閉めは除く
  function onTap(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("a, button, summary, details")) return;
    setBars((v) => !v);
  }

  return (
    <div className="reader" onClick={onTap}>
      <header className={`reader-top${bars ? "" : " hidden"}`}>
        <Link href={`/t/${themeId}`} className="reader-back" aria-label="作品のページへ戻る">
          ‹
        </Link>
        <span className="reader-title">{title}</span>
        <span className="reader-ep">第{episode}話</span>
      </header>

      <div className="reader-pages">
        {!data && !error && status !== 404 ? (
          <ReaderSkeleton />
        ) : !data ? (
          <p className="reader-msg">
            {status === 404 ? "作品が見つかりません" : error}
            {error && status !== 404 && (
              <button type="button" className="btn btn-small btn-ghost" onClick={() => void reload()}>
                もう一度読む
              </button>
            )}
          </p>
        ) : pages.length === 0 ? (
          <p className="reader-msg">
            第{episode}話はまだありません。
            <Link href={`/t/${themeId}`} className="btn btn-small btn-ghost">
              作品のページへ
            </Link>
          </p>
        ) : (
          pages.map((p) => (
            <figure key={p.nodeId} className="reader-page">
              <PageImage
                src={p.imageUrl}
                alt={`第${p.episode}話 ${p.pageInEpisode}ページ目`}
                className="reader-img"
                eager={p.pageInEpisode <= 2}
              />
              <details className="reader-lines" open>
                <summary>
                  {p.pageInEpisode}ページ目のセリフ（{p.authorName}さん）
                </summary>
                <Lines lines={p.lines} dark />
              </details>
            </figure>
          ))
        )}

        {data && pages.length > 0 && (
          <div className="reader-end">
            <p className="reader-end-title">{complete ? `第${episode}話 おわり` : `第${episode}話 つづく`}</p>
            {hasNext ? (
              <Link href={`/t/${themeId}/ep/${episode + 1}`} className="btn btn-block btn-lg">
                次の話へ
              </Link>
            ) : recruiting ? (
              <div className="reader-recruit">
                <p>
                  続きを募集中（第{data.slot.episode}話 {data.slot.pageInEpisode}ページ目）
                </p>
                <div className="slot-actions">
                  <Link href={`/swipe?theme=${encodeURIComponent(themeId)}`} className="btn">
                    評価する
                  </Link>
                  <Link href={`/t/${themeId}/write`} className="btn btn-ghost">
                    描く
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <nav className={`reader-bottom${bars ? "" : " hidden"}`} aria-label="話の移動">
        {episode > 1 ? (
          <Link href={`/t/${themeId}/ep/${episode - 1}`} className="reader-nav">
            ‹ 前の話
          </Link>
        ) : (
          <span className="reader-nav is-disabled">‹ 前の話</span>
        )}
        {hasNext ? (
          <Link href={`/t/${themeId}/ep/${episode + 1}`} className="reader-nav">
            次の話 ›
          </Link>
        ) : (
          <span className="reader-nav is-disabled">次の話 ›</span>
        )}
      </nav>
    </div>
  );
}
