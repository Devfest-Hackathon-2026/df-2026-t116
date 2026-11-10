// 画面からサーバーへの呼び出しは、すべてここを通す（形は src/lib/apiTypes.ts）。
// NEXT_PUBLIC_MOCK_API=1 かつ本番でない時だけ、mockData.ts の作り物を返す（サーバーを使わない）。
import type {
  CandidateView,
  DeckCard,
  DeckResponse,
  PatchVoteBody,
  PostNodeBody,
  PostThemeBody,
  PostVoteBody,
  ThemeDetail2,
  ThemeListResponse,
  ThemeSummary,
} from "@/lib/apiTypes";
import { apiFetch, devUser } from "./firebase";
import type * as MockModule from "./mockData";

export const MOCK_API = process.env.NEXT_PUBLIC_MOCK_API === "1" && process.env.NODE_ENV !== "production";

// 本番のビルドでは条件が false に置き換わり、作り物の中身は bundle に入らない
const mock: typeof MockModule = (
  process.env.NEXT_PUBLIC_MOCK_API === "1" && process.env.NODE_ENV !== "production" ? require("./mockData") : null
) as typeof MockModule;

/** サーバーが返した失敗。message は画面にそのまま出せる文 */
export class ApiFailure extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function failureMessage(e: unknown): string {
  if (e instanceof ApiFailure) return e.message;
  return "通信に失敗しました。もう一度試してください";
}

export function failureStatus(e: unknown): number | null {
  return e instanceof ApiFailure ? e.status : null;
}

// ---- 山の数が変わった時の知らせ（下のタブの印・ホームの帯が読み直す） ----
const DECK_EVENT = "t116-deck-changed";

function deckChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DECK_EVENT));
}

export function onDeckChanged(cb: () => void): () => void {
  window.addEventListener(DECK_EVENT, cb);
  return () => window.removeEventListener(DECK_EVENT, cb);
}

// ---- 呼び出しの共通 ----
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch {
    throw new ApiFailure(0, "通信に失敗しました。もう一度試してください");
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiFailure(res.status, body.error ?? `うまくいきませんでした（${res.status}）`);
  return body;
}

/** 作り物: 少し待ってから返す（読み込み中の見た目を確かめられるように） */
async function fake<T>(fn: () => T, ms = 150): Promise<T> {
  await new Promise((r) => setTimeout(r, ms));
  try {
    return structuredClone(fn());
  } catch (e) {
    if (mock && e instanceof mock.MockHttpError) throw new ApiFailure(e.status, e.message);
    throw e;
  }
}

function peek<T>(fn: () => T): T | undefined {
  if (!MOCK_API) return undefined;
  try {
    return structuredClone(fn());
  } catch {
    return undefined;
  }
}

const enc = encodeURIComponent;

// ---- 作品 ----
export async function listThemes(): Promise<ThemeSummary[]> {
  if (MOCK_API) return fake(() => mock.mockListThemes());
  return (await call<ThemeListResponse>("/api/themes")).themes;
}

export async function getTheme(id: string): Promise<ThemeDetail2> {
  if (MOCK_API) return fake(() => mock.mockGetTheme(id));
  return call<ThemeDetail2>(`/api/themes/${enc(id)}`);
}

export async function createTheme(body: PostThemeBody): Promise<ThemeSummary> {
  if (MOCK_API) return fake(() => mock.mockCreateTheme(body, devUser()), 400);
  return (await call<{ theme: ThemeSummary }>("/api/themes", { method: "POST", body: JSON.stringify(body) })).theme;
}

/** 始めた人が作品名を付ける・直す */
export async function renameTheme(id: string, title: string): Promise<ThemeDetail2> {
  return MOCK_API
    ? fake(() => mock.mockRename(id, title), 300)
    : call<ThemeDetail2>(`/api/themes/${enc(id)}`, { method: "PATCH", body: JSON.stringify({ title }) });
}

/** 始めた人が設定画を描き直す（1作品2回まで）。characterId が無ければ確定前のパーツのキャラ全部 */
export async function retrySheets(id: string, characterId?: string): Promise<ThemeDetail2> {
  return MOCK_API
    ? fake(() => mock.mockSheets(id), 300)
    : call<ThemeDetail2>(`/api/themes/${enc(id)}/sheets/retry`, {
        method: "POST",
        body: JSON.stringify(characterId ? { characterId } : {}),
      });
}

/** 始めた人が設定画を確定する（パーツのキャラ全部の設定画ができている時だけ） */
export async function confirmSheets(id: string): Promise<ThemeDetail2> {
  return MOCK_API
    ? fake(() => mock.mockSheets(id, true), 300)
    : call<ThemeDetail2>(`/api/themes/${enc(id)}/sheets/confirm`, { method: "POST" });
}

/** 始めた人が「締めて決める」 */
export async function confirmSlot(id: string): Promise<ThemeDetail2> {
  const r = MOCK_API
    ? await fake(() => mock.mockConfirm(id), 300)
    : await call<ThemeDetail2>(`/api/themes/${enc(id)}/confirm`, { method: "POST" });
  deckChanged();
  return r;
}

// ---- 候補を描く ----
// POST は生成が終わるまで返らない。画面は待たずに作品のページへ移るので、遅れて返った失敗はここに持つ。
const lateErrors = new Map<string, string>();
const pendingPosts = new Map<string, string>();

/** その作品に送った候補で、遅れて返った失敗の理由（読んだら消える） */
export function takeLatePostError(themeId: string): string | null {
  const m = lateErrors.get(themeId) ?? null;
  lateErrors.delete(themeId);
  return m;
}

/** その作品に送って、まだ返っていない候補の nodeId */
export function pendingPost(themeId: string): string | null {
  return pendingPosts.get(themeId) ?? null;
}

async function postNodeRaw(body: PostNodeBody): Promise<CandidateView> {
  if (MOCK_API) {
    const first = await fake(() => mock.mockPostNode(body, devUser()), 200);
    await new Promise((r) => setTimeout(r, mock.mockGenerateWait(body.nodeId)));
    return structuredClone(mock.mockCandidate(body.nodeId) ?? first);
  }
  return call<CandidateView>("/api/nodes", { method: "POST", body: JSON.stringify(body) });
}

/**
 * 候補を送る。`early` は waitMs の間に返った失敗（409・429 など）。返らなければ null。
 * それより後の失敗は takeLatePostError で作品のページが受け取る。
 */
export function submitNode(body: PostNodeBody, waitMs = 1500): { early: Promise<ApiFailure | null> } {
  let settledEarly = true;
  pendingPosts.set(body.themeId, body.nodeId);
  const done = postNodeRaw(body)
    .then(() => null)
    .catch((e: unknown) => {
      const f = e instanceof ApiFailure ? e : new ApiFailure(0, failureMessage(e));
      if (!settledEarly) lateErrors.set(body.themeId, f.message);
      return f;
    })
    .finally(() => {
      if (pendingPosts.get(body.themeId) === body.nodeId) pendingPosts.delete(body.themeId);
      deckChanged();
    });
  const early = Promise.race([
    done,
    new Promise<null>((r) =>
      setTimeout(() => {
        settledEarly = false;
        r(null);
      }, waitMs),
    ),
  ]);
  return { early };
}

// ---- 評価 ----
/** ログインしていなければ 401 */
export async function getDeck(themeId?: string | null): Promise<DeckCard[]> {
  if (MOCK_API) return fake(() => mock.mockDeck(themeId ?? null));
  const q = themeId ? `?themeId=${enc(themeId)}` : "";
  return (await call<DeckResponse>(`/api/deck${q}`)).cards;
}

// POST・PATCH・DELETE /api/votes は、どれもその候補の CandidateView をそのまま返す
export async function vote(body: PostVoteBody): Promise<CandidateView> {
  const r = MOCK_API
    ? await fake(() => mock.mockVote(body.nodeId, body.like), 120)
    : await call<CandidateView>("/api/votes", { method: "POST", body: JSON.stringify(body) });
  deckChanged();
  return r;
}

/** いいねの理由。ページが決まった後でも付け直せる */
export async function setReason(body: PatchVoteBody): Promise<CandidateView> {
  if (MOCK_API) return fake(() => mock.mockSetReason(body.nodeId, body.reason), 120);
  return call<CandidateView>("/api/votes", { method: "PATCH", body: JSON.stringify(body) });
}

/** 1つ戻す。ページが決まった後は 400 */
export async function undoVote(nodeId: string): Promise<CandidateView> {
  const r = MOCK_API
    ? await fake(() => mock.mockUndoVote(nodeId), 120)
    : await call<CandidateView>(`/api/votes?nodeId=${enc(nodeId)}`, { method: "DELETE" });
  deckChanged();
  return r;
}

// ---- 作り物の時だけ、最初の描画に中身を入れる（サーバーでの描画にも中身が出る）。本物では undefined ----
export function peekThemes(): ThemeSummary[] | undefined {
  return peek(() => mock.mockListThemes());
}

export function peekTheme(id: string): ThemeDetail2 | undefined {
  return peek(() => mock.mockGetTheme(id));
}
