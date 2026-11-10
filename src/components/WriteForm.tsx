"use client";
// 描く: 1つ前の決まったページを見せ、募集中のページのコマ1〜4のセリフを書いて送る。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PAGES_PER_EPISODE, displayTitle, type ThemeDetail2 } from "@/lib/apiTypes";
import { getTheme, peekTheme, submitNode } from "@/lib/client/api";
import { useAuth } from "./AuthProvider";
import { useLoad } from "./hooks";
import { LINE_LABELS, charLen } from "./labels";
import { Lines } from "./Lines";
import { LoginPrompt } from "./LoginPrompt";
import { PageImage } from "./PageImage";
import { WriteSkeleton } from "./Skeleton";

const LINE_MAX = 30;

export function WriteForm({ themeId }: { themeId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const { data, error, status, reload } = useLoad<ThemeDetail2>(
    () => getTheme(themeId),
    peekTheme(themeId),
    themeId,
  );
  const [lines, setLines] = useState(["", "", "", ""]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  if (!data) {
    if (status === 404) return <p className="error">作品が見つかりません</p>;
    if (error) {
      return (
        <div className="error">
          <p>{error}</p>
          <button type="button" className="btn btn-small btn-ghost" onClick={() => void reload()}>
            もう一度読む
          </button>
        </div>
      );
    }
    return <WriteSkeleton />;
  }

  const { theme, pages, slot } = data;
  const prev = [...pages].sort((a, b) => a.index - b.index)[pages.length - 1] ?? null;
  const mine = slot.candidates.find((c) => c.mine);
  const already = mine && (mine.status === "generating" || mine.status === "done");

  const trimmed = lines.map((l) => l.trim());
  const over = trimmed.some((l) => charLen(l) > LINE_MAX);
  const empty = trimmed.every((l) => l === "");
  const canSend = !sending && !over && !empty;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    if (!user) {
      setNeedLogin(true);
      return;
    }
    setSending(true);
    setSendError(null);
    // POST は生成が終わるまで返らないので待たない。1.5 秒以内に返った失敗（409・429 など）だけここに出す
    const { early } = submitNode({ nodeId: crypto.randomUUID(), themeId, slot: slot.index, lines: trimmed });
    const err = await early;
    if (err) {
      setSendError(err.message);
      setSending(false);
      if (err.status === 409) void reload();
      return;
    }
    router.push(`/t/${themeId}`);
  }

  return (
    <div className="write-page">
      <Link href={`/t/${themeId}`} className="back-link">
        ‹ {displayTitle(theme)}
      </Link>
      <h1 className="page-title">
        第{slot.episode}話 {slot.pageInEpisode}ページ目を描く
      </h1>
      {slot.pageInEpisode === PAGES_PER_EPISODE && <p className="notice">この話の最後のページです。話の区切りになるように。</p>}

      {prev ? (
        <section className="prev-page">
          <p className="small muted">1つ前のページ（第{prev.episode}話 {prev.pageInEpisode}ページ目）</p>
          <div className="prev-row">
            <PageImage src={prev.imageUrl} alt="1つ前のページ" className="prev-img" />
            <Lines lines={prev.lines} authorName={prev.authorName} />
          </div>
        </section>
      ) : (
        <section className="prev-page">
          <p className="small muted">物語の軸</p>
          <p className="small">{theme.text}</p>
        </section>
      )}

      {already ? (
        <div className="notice">
          <p>このページにはもう描きました（1ページに1人1本）。</p>
          <Link href={`/t/${themeId}`} className="btn btn-small">
            作品のページで見る
          </Link>
        </div>
      ) : (
        <form onSubmit={submit}>
          <p className="small muted">コマ1〜4のセリフ（各{LINE_MAX}字まで・空欄可・1つは書く）</p>
          {LINE_LABELS.map((label, i) => {
            const left = LINE_MAX - charLen(trimmed[i] ?? "");
            return (
              <div className="field" key={label}>
                <label className="field-label" htmlFor={`line-${i}`}>
                  <span>{label}</span>
                  <span className={`counter${left < 0 ? " over" : ""}`}>あと{left}字</span>
                </label>
                <input
                  id={`line-${i}`}
                  className="input"
                  value={lines[i]}
                  disabled={sending}
                  autoComplete="off"
                  aria-invalid={left < 0}
                  onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? e.target.value : l)))}
                />
              </div>
            );
          })}
          {sendError && (
            <p className="error" role="alert">
              {sendError}
            </p>
          )}
          {needLogin && !user && <LoginPrompt message="描くにはログインしてください" />}
          <button type="submit" className="btn btn-block btn-lg" disabled={!canSend}>
            {sending ? "送っています…" : "送ってページにする"}
          </button>
        </form>
      )}
    </div>
  );
}
