"use client";
// 作品のページ: 見出し → いま募集中 → 自分の候補 → 締めて決める → 話の一覧 → 下に固定の「読む」ボタン
import Link from "next/link";
import { useEffect, useState } from "react";
import { ART_STYLES } from "@/lib/artStyles";
import {
  PAGES_PER_EPISODE,
  displayTitle,
  type CandidateView,
  type PageView,
  type ThemeDetail2,
} from "@/lib/apiTypes";
import {
  MOCK_API,
  confirmSheets,
  confirmSlot,
  failureMessage,
  getTheme,
  peekTheme,
  pendingPost,
  renameTheme,
  retrySheets,
  takeLatePostError,
} from "@/lib/client/api";
import { useAuth } from "./AuthProvider";
import { CharacterChips, SheetThumb } from "./CharacterChips";
import { lastReadEpisode, useLoad, useNow } from "./hooks";
import { REASON_LABELS } from "./labels";
import { emptyPageFixedCta, viewerCanWrite } from "./emptyPageCta";
import { LoginPrompt } from "./LoginPrompt";
import { PageImage } from "./PageImage";
import { GEN_HINT, GenProgress } from "./GenProgress";
import { ThemeSkeleton } from "./Skeleton";

const CANDIDATE_STEPS = ["受け付けた", "絵を描いている", "保存して公開する"];
const SHEET_STEPS = ["受け付けた", "設定画を描いている", "保存する"];

interface Episode {
  episode: number;
  pages: PageView[];
}

export function episodesOf(pages: PageView[]): Episode[] {
  const out: Episode[] = [];
  for (const p of pages) {
    let ep = out.find((e) => e.episode === p.episode);
    if (!ep) {
      ep = { episode: p.episode, pages: [] };
      out.push(ep);
    }
    ep.pages.push(p);
  }
  out.sort((a, b) => a.episode - b.episode);
  for (const e of out) e.pages.sort((a, b) => a.index - b.index);
  return out;
}

function styleLabel(id: string): string {
  return ART_STYLES.find((s) => s.id === id)?.label ?? id;
}

function MyCandidate({
  c,
  themeId,
  now,
}: {
  c: CandidateView;
  themeId: string;
  now: number | null;
}) {
  if (c.status === "generating") {
    const sec =
      now === null ? null : Math.max(0, Math.floor((now - c.createdAt) / 1000));
    return (
      <GenProgress
        title="描いています…"
        steps={CANDIDATE_STEPS}
        active={1}
        elapsedSec={sec}
        hint={GEN_HINT}
      />
    );
  }
  if (c.status === "failed" || c.status === "rejected") {
    return (
      <div className="mine-box mine-fail">
        <p className="mine-fail-title">
          {c.status === "failed" ? "描けませんでした" : "止められました"}
        </p>
        {c.failReason && <p className="small">{c.failReason}</p>}
        <Link href={`/t/${themeId}/write`} className="btn btn-small">
          描き直す
        </Link>
      </div>
    );
  }
  return (
    <div className="mine-box mine-done">
      <PageImage src={c.imageUrl} alt="あなたの候補" className="mine-thumb" />
      <div className="mine-body">
        <p className="mine-likes">
          <span className="heart" aria-hidden="true">
            ♥
          </span>{" "}
          いいね {c.likes ?? 0}
        </p>
        {c.reasons && (
          <ul className="reason-list">
            {REASON_LABELS.map((r) => (
              <li key={r.key}>
                <span>{r.label}</span>
                <span className="tabular">{c.reasons?.[r.key] ?? 0}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ThemeClient({ themeId }: { themeId: string }) {
  const { user, login } = useAuth();
  const { data, error, status, reload, setData } = useLoad<ThemeDetail2>(
    () => getTheme(themeId),
    peekTheme(themeId),
    themeId,
  );
  const now = useNow(1000);
  const [openText, setOpenText] = useState(false);
  const [lateError, setLateError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [sheetBusy, setSheetBusy] = useState<"retry" | "confirm" | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [readEp, setReadEp] = useState(0);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);

  useEffect(() => setReadEp(lastReadEpisode(themeId)), [themeId]);

  const mine = data?.slot.candidates.find((c) => c.mine) ?? null;
  const waiting =
    mine?.status === "generating" || (pendingPost(themeId) !== null && !mine);

  // 自分の候補を描いている間は2秒ごとに読み直す。遅れて返った送信の失敗もここで拾う
  useEffect(() => {
    const check = () => {
      const m = takeLatePostError(themeId);
      if (m) setLateError(m);
    };
    check();
    if (!waiting) return;
    const t = window.setInterval(() => {
      check();
      void reload();
    }, 2000);
    return () => window.clearInterval(t);
  }, [waiting, themeId, reload]);

  if (!data) {
    if (status === 404) {
      return (
        <div className="empty-box">
          <p>作品が見つかりません</p>
          <Link href="/" className="btn btn-ghost">
            ホームへ
          </Link>
        </div>
      );
    }
    if (error) {
      return (
        <div className="error">
          <p>{error}</p>
          <button
            type="button"
            className="btn btn-small btn-ghost"
            onClick={() => void reload()}
          >
            もう一度読む
          </button>
        </div>
      );
    }
    return <ThemeSkeleton />;
  }

  const { theme, pages, slot } = data;
  const episodes = episodesOf(pages);
  const others = slot.candidates.filter((c) => !c.mine && c.myVote);
  const minutesLeft =
    slot.autoConfirmAt !== null && now !== null
      ? Math.ceil((slot.autoConfirmAt - now) / 60000)
      : null;
  const customs = theme.characters.flatMap((c) => (c.kind === "custom" ? [c] : []));
  const sheetsPending = customs.length > 0 && !theme.sheetsConfirmed;
  const sheetsAllDone = customs.every((c) => c.sheetStatus === "done");
  const mineStatus = mine?.status ?? null;
  const canWrite = viewerCanWrite(sheetsPending, mineStatus);
  const emptyCta = emptyPageFixedCta({ sheetsPending, mineStatus, loggedIn: user !== null });

  // 下に固定のボタン: 読んだ話があれば「続きから読む」
  const lastEp = episodes[episodes.length - 1]?.episode ?? 0;
  const readFull =
    episodes.find((e) => e.episode === readEp)?.pages.length ===
    PAGES_PER_EPISODE;
  const resumeEp =
    readEp > 0 ? Math.min(readFull ? readEp + 1 : readEp, lastEp) : 0;

  async function saveTitle() {
    if (titleDraft === null) return;
    setTitleSaving(true);
    setTitleError(null);
    try {
      setData(await renameTheme(theme.id, titleDraft.trim()));
      setTitleDraft(null);
    } catch (e) {
      setTitleError(failureMessage(e));
    } finally {
      setTitleSaving(false);
    }
  }

  async function sheetAction(kind: "retry" | "confirm") {
    setSheetBusy(kind);
    setSheetError(null);
    try {
      setData(await (kind === "retry" ? retrySheets(theme.id) : confirmSheets(theme.id)));
    } catch (e) {
      setSheetError(failureMessage(e));
    } finally {
      setSheetBusy(null);
    }
  }

  async function confirm() {
    if (!user) {
      setNeedLogin(true);
      return;
    }
    if (
      !window.confirm(
        `第${slot.episode}話 ${slot.pageInEpisode}ページ目を、いまの票で決めます。よろしいですか？`,
      )
    )
      return;
    setConfirming(true);
    setConfirmError(null);
    try {
      setData(await confirmSlot(theme.id));
    } catch (e) {
      setConfirmError(failureMessage(e));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="theme-page">
      <section className="theme-hero">
        {theme.coverUrl && !MOCK_API && (
          <div
            className="theme-hero-bg"
            style={{ backgroundImage: `url(${theme.coverUrl})` }}
            aria-hidden="true"
          />
        )}
        <div className="theme-hero-inner">
          <PageImage
            src={theme.coverUrl}
            alt={`${displayTitle(theme)}の表紙`}
            className="theme-cover"
            eager
          />
          <div className="theme-hero-info">
            <h1 className="theme-title">{displayTitle(theme)}</h1>
            {theme.mine && titleDraft === null && (
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setTitleDraft(theme.title ?? "");
                  setTitleError(null);
                }}
              >
                {theme.title ? "作品名を直す" : "作品名を付ける"}
              </button>
            )}
            {theme.mine && titleDraft !== null && (
              <div className="field">
                <label className="field-label" htmlFor="rename-title">
                  作品名（1〜20字）
                </label>
                <input
                  id="rename-title"
                  className="input"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  autoComplete="off"
                  aria-invalid={!!titleError}
                />
                {titleError && <p className="error">{titleError}</p>}
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={
                    titleSaving ||
                    titleDraft.trim() === "" ||
                    [...titleDraft.trim()].length > 20
                  }
                  onClick={() => void saveTitle()}
                >
                  {titleSaving ? "保存中…" : "保存"}
                </button>{" "}
                <button
                  type="button"
                  className="btn btn-small btn-ghost"
                  disabled={titleSaving}
                  onClick={() => setTitleDraft(null)}
                >
                  やめる
                </button>
              </div>
            )}
            <p className="theme-by">始めた人：{theme.authorName}さん</p>
            <p className="theme-tags">
              <span className="tag">{styleLabel(theme.artStyle)}</span>
              {theme.completedEpisodes > 0 && (
                <span className="tag tag-accent">
                  完結{theme.completedEpisodes}話
                </span>
              )}
            </p>
            <CharacterChips characters={theme.characters} />
          </div>
        </div>
        <div className="theme-axis">
          <p className={`theme-text${openText ? " open" : ""}`} id="theme-text">
            {theme.text}
          </p>
          {[...theme.text].length > 60 && (
            <button
              type="button"
              className="link-btn"
              aria-expanded={openText}
              aria-controls="theme-text"
              onClick={() => setOpenText((v) => !v)}
            >
              {openText ? "閉じる" : "もっと見る"}
            </button>
          )}
        </div>
      </section>

      {customs.length > 0 && (
        <section className="sheet-box" aria-labelledby="sheet-title">
          <h2 className="section-title" id="sheet-title">
            キャラの設定画
          </h2>
          <ul className={theme.sheetsConfirmed ? "sheet-list sheet-list-small" : "sheet-list"}>
            {customs.map((c) => (
              <li key={c.name} className="sheet-item">
                {c.sheetUrl ? (
                  <SheetThumb src={c.sheetUrl} name={c.name} size={theme.sheetsConfirmed ? 64 : 120} />
                ) : (
                  <span
                    className={`sheet-thumb sheet-thumb-empty small${c.sheetStatus === "generating" ? " sheet-thumb-busy" : ""}`}
                    style={theme.sheetsConfirmed ? { width: 64, height: 64 } : { width: 120, height: 120 }}
                  >
                    {c.sheetStatus === "generating" ? "作成中" : "描けませんでした"}
                  </span>
                )}
                <span className="sheet-name">{c.name}</span>
                {c.sheetStatus === "failed" && !c.sheetUrl && (
                  <span className="small muted">設定画を作れませんでした。描き直してください</span>
                )}
                {c.sheetUrl && c.sheetFailReason && (
                  <span className="small muted">描き直しに失敗しました（{c.sheetFailReason}）。前の絵を残しています</span>
                )}
              </li>
            ))}
          </ul>
          {(sheetBusy === "retry" || customs.some((c) => c.sheetStatus === "generating")) && (
            <GenProgress
              title={sheetBusy === "retry" ? "設定画を描き直しています…" : "設定画を描いています…"}
              steps={SHEET_STEPS}
              active={1}
              hint={GEN_HINT}
            />
          )}
          {sheetsPending && theme.mine && (
            <div className="owner-box">
              <button
                type="button"
                className="btn btn-block"
                disabled={!sheetsAllDone || sheetBusy !== null}
                onClick={() => void sheetAction("confirm")}
              >
                {sheetBusy === "confirm" ? "確定しています…" : "この設定画で確定する"}
              </button>
              <button
                type="button"
                className="btn btn-block btn-ghost"
                disabled={theme.sheetRetriesLeft <= 0 || sheetBusy !== null}
                onClick={() => void sheetAction("retry")}
              >
                {sheetBusy === "retry"
                  ? "設定画を作成中…"
                  : `描き直す（残り${theme.sheetRetriesLeft}回）`}
              </button>
              {sheetError && <p className="error">{sheetError}</p>}
            </div>
          )}
          {sheetsPending && !theme.mine && (
            <p className="small muted">始めた人が設定画を確認中です</p>
          )}
        </section>
      )}

      <section className="slot-box" aria-labelledby="slot-title">
        <p className="slot-title" id="slot-title">
          いま募集中：第{slot.episode}話 {slot.pageInEpisode}ページ目
          <span className="slot-count">（候補 {slot.doneCount}本）</span>
        </p>
        {slot.pageInEpisode === PAGES_PER_EPISODE && (
          <p className="small muted">この話の最後のページです</p>
        )}
        {minutesLeft !== null && (
          <p className="slot-auto">
            {minutesLeft > 0
              ? `あと${minutesLeft}分で決まります`
              : "まもなく決まります"}
          </p>
        )}
        <div className="slot-actions">
          <Link
            href={`/swipe?theme=${encodeURIComponent(theme.id)}`}
            className="btn"
          >
            候補を評価する
            {slot.toSwipeCount > 0 && (
              <span className="btn-count">{slot.toSwipeCount}</span>
            )}
          </Link>
          {sheetsPending ? (
            <span className="btn btn-ghost is-disabled" aria-disabled="true">
              このページを描く
            </span>
          ) : canWrite ? (
            <Link href={`/t/${theme.id}/write`} className="btn btn-ghost">
              このページを描く
            </Link>
          ) : !user ? (
            <button type="button" className="btn btn-ghost" onClick={() => void login()}>
              ログインして描く
            </button>
          ) : (
            <span className="btn btn-ghost is-disabled" aria-disabled="true">
              描きました
            </span>
          )}
        </div>
        {sheetsPending && (
          <p className="small muted">設定画の確認が終わるまで描けません</p>
        )}
      </section>

      {lateError && (
        <p className="error" role="alert">
          送った候補が受け付けられませんでした：{lateError}
        </p>
      )}

      {(mine || waiting) && (
        <section>
          <h2 className="section-title">あなたの候補</h2>
          {mine ? (
            <MyCandidate c={mine} themeId={theme.id} now={now} />
          ) : (
            <GenProgress
              title="送っています…"
              steps={CANDIDATE_STEPS}
              active={0}
              hint={GEN_HINT}
            />
          )}
        </section>
      )}

      {theme.mine && (slot.canConfirm || confirmError) && (
        <section className="owner-box">
          <p className="small">
            作品を始めた人は、いまの票でこのページを決められます。
          </p>
          <button
            type="button"
            className="btn btn-block"
            onClick={() => void confirm()}
            disabled={confirming}
          >
            {confirming ? "決めています…" : "締めて決める"}
          </button>
          {confirmError && <p className="error">{confirmError}</p>}
          {needLogin && !user && (
            <LoginPrompt message="締めるにはログインしてください" />
          )}
        </section>
      )}

      {others.length > 0 && (
        <section>
          <h2 className="section-title">あなたが評価した候補</h2>
          <ul className="voted-list">
            {others.map((c) => (
              <li key={c.nodeId}>
                <span className="voted-who">{c.authorName}さん</span>
                <span className="small muted">
                  {c.myVote?.like ? "いいねした" : "いまいち"}
                </span>
                <span className="tabular">♥ {c.likes ?? 0}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="section-title">話の一覧</h2>
        <ul className="episode-list">
          {episodes.map((e) => {
            const done = e.pages.length === PAGES_PER_EPISODE;
            const first = e.pages[0];
            return (
              <li key={e.episode}>
                <Link
                  href={`/t/${theme.id}/ep/${e.episode}`}
                  className="episode-row"
                >
                  <PageImage
                    src={first?.imageUrl ?? null}
                    alt=""
                    className="episode-thumb"
                  />
                  <span className="episode-name">第{e.episode}話</span>
                  <span className={`episode-state${done ? "" : " ongoing"}`}>
                    {done ? "完結" : `連載中 ${e.pages.length}/4`}
                  </span>
                  {readEp >= e.episode && (
                    <span className="small muted">読んだ</span>
                  )}
                </Link>
              </li>
            );
          })}
          {slot.pageInEpisode === 1 && (
            <li>
              <div className="episode-row is-disabled">
                <span
                  className="episode-thumb episode-thumb-empty"
                  aria-hidden="true"
                />
                <span className="episode-name">第{slot.episode}話</span>
                <span className="episode-state ongoing">1ページ目を募集中</span>
              </div>
            </li>
          )}
        </ul>
      </section>

      <div className="fixed-cta">
        {episodes.length === 0 ? (
          emptyCta.kind === "write" ? (
            <Link href={`/t/${theme.id}/write`} className="btn btn-block btn-lg">
              {emptyCta.label}
            </Link>
          ) : emptyCta.kind === "login" ? (
            <button type="button" className="btn btn-block btn-lg" onClick={() => void login()}>
              {emptyCta.label}
            </button>
          ) : (
            <span className="btn btn-block btn-lg is-disabled" aria-disabled="true">
              {emptyCta.label}
            </span>
          )
        ) : resumeEp > 0 ? (
          <Link
            href={`/t/${theme.id}/ep/${resumeEp}`}
            className="btn btn-block btn-lg"
          >
            続きから読む（第{resumeEp}話）
          </Link>
        ) : (
          <Link href={`/t/${theme.id}/ep/1`} className="btn btn-block btn-lg">
            1話から読む
          </Link>
        )}
      </div>
    </div>
  );
}
