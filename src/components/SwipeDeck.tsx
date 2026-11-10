"use client";
// 評価する: 重ねたカードを右（いいね）・左（いまいち）に送る。素の Pointer Events と CSS だけで作る。
// 確定: 横に幅の30%以上、または離す直前の速さ 0.5px/ms 超。回転は最大±15度。
// 戻り 0.25 秒・飛ぶ 0.28 秒。動きを減らす設定では飛ばさずに消す。ボタンと左右キー・Backspace でも同じ。
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { UNTITLED, type DeckCard } from "@/lib/apiTypes";
import { failureMessage, failureStatus, getDeck, setReason, undoVote, vote } from "@/lib/client/api";
import type { VoteReason } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { CharacterChips } from "./CharacterChips";
import { prefersReducedMotion } from "./hooks";
import { REASON_LABELS } from "./labels";
import { Lines } from "./Lines";
import { LoginPrompt } from "./LoginPrompt";
import { PageImage, preloadImage } from "./PageImage";
import { SwipeSkeleton } from "./Skeleton";

const COMMIT_RATIO = 0.3;
const COMMIT_SPEED = 0.5; // px/ms
const MAX_ROTATE = 15;
const BACK_MS = 250;
const FLY_MS = 280;
const REASON_MS = 3000;
const VELOCITY_WINDOW = 100; // 離す直前の何ミリ秒で速さを見るか
const HINT_KEY = "t116.swipeHint";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function SwipeDeck({ themeId }: { themeId: string | null }) {
  const { user, ready } = useAuth();
  return (
    <div className="swipe-page">
      <div className="swipe-head">
        <h1 className="page-title">評価する</h1>
        {themeId && (
          <Link href="/swipe" className="small">
            すべての作品の候補を見る
          </Link>
        )}
      </div>
      {!ready ? (
        <SwipeSkeleton />
      ) : !user ? (
        <LoginPrompt message="評価するにはログインしてください" />
      ) : (
        <Deck themeId={themeId} />
      )}
    </div>
  );
}

interface Done {
  card: DeckCard;
  like: boolean;
}

function Deck({ themeId }: { themeId: string | null }) {
  const [cards, setCards] = useState<DeckCard[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pos, setPos] = useState(0);
  const [history, setHistory] = useState<Done[]>([]);
  const [message, setMessage] = useState("");
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(false);
  const [hint, setHint] = useState(false);

  const topRef = useRef<HTMLDivElement | null>(null);
  const animating = useRef(false);
  const pendingVotes = useRef(new Map<string, Promise<boolean>>());
  const reasonTimer = useRef(0);
  const drag = useRef({
    active: false,
    pointerId: -1,
    x0: 0,
    y0: 0,
    dx: 0,
    dy: 0,
    samples: [] as { x: number; t: number }[],
    raf: 0,
  });

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await getDeck(themeId);
      setCards(list);
      setPos(0);
      setHistory([]);
    } catch (e) {
      setLoadError(failureMessage(e));
    }
  }, [themeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(HINT_KEY)) setHint(true);
    } catch {
      // 出せなくても困らない
    }
    return () => window.clearTimeout(reasonTimer.current);
  }, []);

  const closeHint = useCallback(() => {
    setHint(false);
    try {
      window.localStorage.setItem(HINT_KEY, "1");
    } catch {
      // 次も出るだけ
    }
  }, []);

  // 次の2枚の絵を先に読む
  useEffect(() => {
    if (!cards) return;
    for (const c of cards.slice(pos + 1, pos + 3)) preloadImage(c.imageUrl);
  }, [cards, pos]);

  const total = cards?.length ?? 0;
  const card = cards?.[pos] ?? null;
  const next = cards?.[pos + 1] ?? null;

  // ---- 見た目を書く（rAF の中） ----
  const paint = useCallback(() => {
    const d = drag.current;
    d.raf = 0;
    const el = topRef.current;
    if (!el) return;
    const w = el.offsetWidth || 1;
    const rot = clamp((d.dx / w) * MAX_ROTATE, -MAX_ROTATE, MAX_ROTATE);
    el.style.transform = `translate(${d.dx}px, ${d.dy}px) rotate(${rot}deg)`;
    const p = clamp(Math.abs(d.dx) / (w * COMMIT_RATIO), 0, 1);
    setStamp(el, d.dx > 0 ? p : 0, d.dx < 0 ? p : 0);
  }, []);

  const springBack = useCallback(() => {
    const d = drag.current;
    if (d.raf) cancelAnimationFrame(d.raf);
    d.raf = 0;
    d.active = false;
    d.dx = 0;
    d.dy = 0;
    const el = topRef.current;
    if (!el) return;
    el.style.transition = `transform ${BACK_MS}ms ease`;
    el.style.transform = "";
    setStamp(el, 0, 0);
  }, []);

  // ---- 確定（スワイプ・ボタン・キー共通） ----
  const commit = useCallback(
    (like: boolean) => {
      if (animating.current || !cards) return;
      const c = cards[pos];
      if (!c) return;
      animating.current = true;
      closeHint();
      setPrevOpen(false);
      window.clearTimeout(reasonTimer.current);
      setReasonFor(null);

      const sent = vote({ nodeId: c.nodeId, like })
        .then(() => true)
        .catch((e: unknown) => {
          const st = failureStatus(e);
          setMessage(
            st === 400
              ? "このページはもう決まったので、評価は数えられませんでした"
              : st === 409
                ? "この候補はもう評価しています"
                : `評価を送れませんでした：${failureMessage(e)}`,
          );
          // 409 は前の評価がサーバーに残っているので、戻す時は DELETE を呼ぶ
          return st === 409;
        });
      pendingVotes.current.set(c.nodeId, sent);

      const finish = () => {
        animating.current = false;
        const d = drag.current;
        d.dx = 0;
        d.dy = 0;
        setPos((p) => p + 1);
        setHistory((h) => [...h, { card: c, like }]);
        setMessage(`${like ? "いいね" : "いまいち"}にしました（${pos + 1} / ${cards.length}）`);
        if (like) {
          setReasonFor(c.nodeId);
          reasonTimer.current = window.setTimeout(() => setReasonFor(null), REASON_MS);
        }
      };

      const el = topRef.current;
      if (!el || prefersReducedMotion()) {
        finish();
        return;
      }
      const d = drag.current;
      const dir = like ? 1 : -1;
      const w = el.offsetWidth || 300;
      const out = Math.max(window.innerWidth, w) + w;
      el.style.transition = `transform ${FLY_MS}ms ease-out`;
      el.style.transform = `translate(${dir * out}px, ${d.dy}px) rotate(${dir * MAX_ROTATE}deg)`;
      setStamp(el, like ? 1 : 0, like ? 0 : 1);
      window.setTimeout(finish, FLY_MS);
    },
    [cards, pos, closeHint],
  );

  const undo = useCallback(async () => {
    if (animating.current) return;
    const last = history[history.length - 1];
    if (!last) return;
    window.clearTimeout(reasonTimer.current);
    setReasonFor(null);
    const counted = await (pendingVotes.current.get(last.card.nodeId) ?? Promise.resolve(true));
    try {
      if (counted) await undoVote(last.card.nodeId);
      pendingVotes.current.delete(last.card.nodeId);
      setHistory((h) => h.slice(0, -1));
      setPos((p) => Math.max(0, p - 1));
      setMessage("1つ戻しました");
    } catch (e) {
      setMessage(failureStatus(e) === 400 ? "もう決まりました（戻せません）" : `戻せませんでした：${failureMessage(e)}`);
    }
  }, [history]);

  const pickReason = useCallback(async (nodeId: string, reason: VoteReason, label: string) => {
    window.clearTimeout(reasonTimer.current);
    setReasonFor(null);
    const counted = await (pendingVotes.current.get(nodeId) ?? Promise.resolve(true));
    if (!counted) return;
    try {
      await setReason({ nodeId, reason });
      setMessage(`理由「${label}」を付けました`);
    } catch (e) {
      setMessage(`理由を付けられませんでした：${failureMessage(e)}`);
    }
  }, []);

  // ---- キー（←いまいち・→いいね・Backspace で戻す） ----
  const keyRef = useRef({ commit, undo, prevOpen });
  keyRef.current = { commit, undo, prevOpen };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable='true']") || t.isContentEditable)) return;
      if (keyRef.current.prevOpen) {
        if (e.key === "Escape") setPrevOpen(false);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        keyRef.current.commit(true);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        keyRef.current.commit(false);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        void keyRef.current.undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- 指・マウスで動かす ----
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (animating.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest("button, a, summary")) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const d = drag.current;
    d.active = true;
    d.pointerId = e.pointerId;
    d.x0 = e.clientX;
    d.y0 = e.clientY;
    d.dx = 0;
    d.dy = 0;
    d.samples = [{ x: e.clientX, t: e.timeStamp }];
    el.style.transition = "none";
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d.active || e.pointerId !== d.pointerId) return;
    d.dx = e.clientX - d.x0;
    d.dy = (e.clientY - d.y0) * 0.3;
    d.samples.push({ x: e.clientX, t: e.timeStamp });
    while (d.samples.length > 2 && e.timeStamp - (d.samples[0]?.t ?? 0) > VELOCITY_WINDOW) d.samples.shift();
    if (!d.raf) d.raf = requestAnimationFrame(paint);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d.active || e.pointerId !== d.pointerId) return;
    d.active = false;
    if (d.raf) cancelAnimationFrame(d.raf);
    d.raf = 0;
    d.dx = e.clientX - d.x0;
    const w = e.currentTarget.offsetWidth || 1;
    // 離す直前の速さ（最後の100ミリ秒）
    const recent = d.samples.filter((s) => e.timeStamp - s.t <= VELOCITY_WINDOW);
    const first = recent[0];
    const dt = first ? e.timeStamp - first.t : 0;
    const v = first && dt > 0 ? (e.clientX - first.x) / dt : 0;
    let dir = 0;
    if (Math.abs(v) > COMMIT_SPEED && Math.sign(v) === Math.sign(d.dx || v)) dir = Math.sign(v);
    else if (Math.abs(d.dx) >= w * COMMIT_RATIO) dir = Math.sign(d.dx);
    if (dir === 0) springBack();
    else commit(dir > 0);
  }

  function onPointerCancel() {
    if (drag.current.active) springBack();
  }

  // ---- 表示 ----
  if (loadError && !cards) {
    return (
      <div className="error">
        <p>{loadError}</p>
        <button type="button" className="btn btn-small btn-ghost" onClick={() => void load()}>
          もう一度読む
        </button>
      </div>
    );
  }
  if (!cards) return <SwipeSkeleton />;

  const reasonCard = reasonFor ? history.find((h) => h.card.nodeId === reasonFor) : undefined;
  const writeHref = themeId
    ? `/t/${themeId}/write`
    : history[history.length - 1]
      ? `/t/${history[history.length - 1]?.card.themeId}/write`
      : "/";

  return (
    <>
      {hint && card && (
        <div className="swipe-hint">
          <p>
            <span aria-hidden="true">← </span>左でいまいち・右でいいね<span aria-hidden="true"> →</span>
          </p>
          <p className="small">下のボタンや左右のキーでも選べます。↶ で1つ戻せます。</p>
          <button type="button" className="btn btn-small btn-ghost" onClick={closeHint}>
            わかった
          </button>
        </div>
      )}

      {card ? (
        <div className={hint ? "swipe-stack has-hint" : "swipe-stack"}>
          {next && (
            <div className="swipe-card is-next" key={next.nodeId} aria-hidden="true">
              <CardBody card={next} onPrev={null} />
            </div>
          )}
          <div
            className="swipe-card is-top"
            key={card.nodeId}
            ref={topRef}
            role="group"
            aria-roledescription="カード"
            aria-label={`${pos + 1} / ${total}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onLostPointerCapture={onPointerCancel}
          >
            <span className="stamp stamp-like" aria-hidden="true">
              いいね
            </span>
            <span className="stamp stamp-nope" aria-hidden="true">
              いまいち
            </span>
            <CardBody card={card} onPrev={card.prevPage ? () => setPrevOpen(true) : null} />
          </div>
        </div>
      ) : (
        <div className="empty-box">
          <p className="empty-title">{total > 0 ? "全部見ました" : "いま評価できる候補はありません"}</p>
          <p className="small muted">新しい候補が届くと、ここに出ます。次はあなたが描いてみませんか。</p>
          <Link href={writeHref} className="btn">
            描いてみる
          </Link>
        </div>
      )}

      <div className="swipe-actions">
        <button
          type="button"
          className="round-btn nope"
          aria-label="いまいち"
          disabled={!card}
          onClick={() => commit(false)}
        >
          ✕
        </button>
        <button
          type="button"
          className="round-btn undo"
          aria-label="1つ戻す"
          disabled={history.length === 0}
          onClick={() => void undo()}
        >
          ↶
        </button>
        <button type="button" className="round-btn like" aria-label="いいね" disabled={!card} onClick={() => commit(true)}>
          ♥
        </button>
      </div>

      <p className="swipe-status" aria-live="polite">
        {message}
      </p>

      {reasonCard && (
        <div className="reason-sheet" role="group" aria-label="いいねの理由（任意）">
          <p className="small">どこが良かった？（押さなくても大丈夫）</p>
          <div className="reason-chips">
            {REASON_LABELS.map((r) => (
              <button
                key={r.key}
                type="button"
                className="chip"
                onClick={() => void pickReason(reasonCard.card.nodeId, r.key, r.label)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {prevOpen && card?.prevPage && (
        <div className="sheet-backdrop" onClick={() => setPrevOpen(false)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="前のページ"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-head">
              <span>前のページ（決まったページ）</span>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setPrevOpen(false)} autoFocus>
                閉じる
              </button>
            </div>
            <PageImage src={card.prevPage.imageUrl} alt="前のページ" className="sheet-img" eager />
            <Lines lines={card.prevPage.lines} />
          </div>
        </div>
      )}
    </>
  );
}

function setStamp(el: HTMLElement, like: number, nope: number): void {
  const a = el.querySelector<HTMLElement>(".stamp-like");
  const b = el.querySelector<HTMLElement>(".stamp-nope");
  if (a) a.style.opacity = String(like);
  if (b) b.style.opacity = String(nope);
}

function CardBody({ card, onPrev }: { card: DeckCard; onPrev: (() => void) | null }) {
  return (
    <>
      <div className="card-head">
        <div>
          <p className="card-title">{card.themeTitle ?? UNTITLED}</p>
          {!card.themeTitle && <p className="card-sub">{card.themeTextHead}</p>}
          <p className="card-sub">
            第{card.episode}話 {card.pageInEpisode}ページ目
          </p>
        </div>
        {onPrev && (
          <button type="button" className="btn btn-small btn-ghost" onClick={onPrev}>
            前のページ
          </button>
        )}
      </div>
      <PageImage src={card.imageUrl} alt={`${card.authorName}さんの候補`} className="card-img" eager />
      <details className="card-lines">
        <summary>セリフを読む（コマ1〜4）</summary>
        <CharacterChips characters={card.characters} />
        <Lines lines={card.lines} authorName={card.authorName} />
      </details>
    </>
  );
}
