// API の処理本体（連載の形。docs/design-d-serial.md）。Next のルートから切り離してあり、テストはここを直接呼ぶ。
import {
  PAGES_PER_EPISODE,
  pagePosition,
  textHead,
  type CandidateView,
  type CharacterView,
  type DeckCard,
  type PageView,
  type SlotView,
  type ThemeDetail2,
  type ThemeSummary,
} from "./apiTypes";
import { DEFAULT_ART_STYLE, artStylePrompt, isArtStyleId } from "./artStyles";
import { buildAppearance, validateParts, type CharacterParts } from "./characterParts";
import { CHARACTERS, findCharacter, type Character } from "./characters";
import type { ComicGenerator, GenerateResult } from "./generator/types";
import type { ImageData, ImageStore } from "./images/types";
import type { Store, Tx } from "./store/types";
import {
  ApiError,
  RENAME_LIMIT_PER_DAY,
  SHEET_RETRY_MAX,
  VOTE_REASONS,
  type ThemeCharacter,
  emptyReasons,
  type NodeDoc,
  type NodePrivateDoc,
  type ThemeDoc,
  type UsageDoc,
  type User,
  type VoteDoc,
  type VoteReason,
} from "./types";

export interface ServiceConfig {
  limitPerUser: number;
  limitGlobal: number;
  genTimeoutSec: number;
  /** ① 完成した候補が2本以上の時、最初の完成から決まるまでの秒（無ければ CONFIRM_AFTER_SEC・既定 300） */
  confirmAfterSec?: number;
  /** ② 完成した候補が1本の時、最初の完成から決まるまでの秒（無ければ CONFIRM_SINGLE_AFTER_SEC・既定 1800） */
  confirmSingleAfterSec?: number;
}

export interface ServiceDeps {
  store: Store;
  images: ImageStore;
  generator: ComicGenerator;
  config: ServiceConfig;
  /** 時計（テストで差し替える） */
  now?: () => number;
  /** 作品の id を作る（既定は crypto.randomUUID） */
  newId?: () => string;
  /** 0以上1未満の乱数（山の順。既定は Math.random） */
  random?: () => number;
}

export const TITLE_MAX = 20;
export const CHARACTER_NAME_MAX = 20;
export const CHARACTER_NOTE_MAX = 80;
export const THEME_TEXT_MAX = 200;
export const LINE_MAX = 30;
export const DECK_MAX = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const len = (s: string) => [...s].length;

/** JST の日付 YYYY-MM-DD */
export function jstDate(ms: number): string {
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function envSec(name: string, def: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : def;
}

const imageUrlOf = (nodeId: string) => `/api/images/${nodeId}`;

/** 期限切れの generating は failed として見せる（保存はしない） */
export function effectiveNode(n: NodeDoc, now: number): NodeDoc {
  if (n.status === "generating" && now > n.deadlineAt) {
    return { ...n, status: "failed", failReason: "時間切れ" };
  }
  return n;
}

/**
 * 期限切れの generating の設定画を失敗に確定する（ページの effectiveNode と同じ考え方）。
 * 前の画像があれば絵を残して done＋理由、無ければ failed。描き直しで予約した回数は、
 * 同じ生成 ID のうち1枚もできていなければ一度だけ戻す（確定後は generating でなくなるので二重に戻らない）。
 * 変更が無ければ同じ参照を返す。
 */
export function settleExpiredSheets(theme: ThemeDoc, now: number): ThemeDoc {
  const expired = (c: ThemeCharacter) =>
    c.kind === "custom" && c.sheetStatus === "generating" && c.sheetDeadlineAt !== undefined && now > c.sheetDeadlineAt;
  if (!theme.characters.some(expired)) return theme;
  const refundIds = new Set<string>();
  const characters = theme.characters.map((c): ThemeCharacter => {
    if (c.kind !== "custom" || !expired(c)) return c;
    if (c.sheetReserved && c.sheetGenId) refundIds.add(c.sheetGenId);
    const reason = "時間切れ";
    return c.sheetPath
      ? { ...c, sheetStatus: "done", sheetFailReason: reason, sheetReserved: false }
      : { ...c, sheetStatus: "failed", sheetPath: null, sheetFailReason: reason, sheetReserved: false };
  });
  // 同じ生成 ID でできた絵があれば戻さない
  const refunds = [...refundIds].filter(
    (id) => !theme.characters.some((c) => c.kind === "custom" && c.sheetGenId === id && c.sheetStatus === "done"),
  ).length;
  return { ...theme, characters, sheetRetries: Math.max(0, theme.sheetRetries - refunds) };
}

/** characters が無い古い作品は characterIds（例のキャラ）から作る */
function normCharacters(r: Partial<ThemeDoc>): ThemeCharacter[] {
  if (Array.isArray(r.characters)) {
    // 設定画の欄が無い保存のパーツのキャラは、画像があれば done・無ければ failed として読む
    return r.characters.map((c): ThemeCharacter => {
      if (c.kind !== "custom") return c;
      const path = typeof c.sheetPath === "string" ? c.sheetPath : null;
      return {
        ...c,
        sheetStatus: c.sheetStatus ?? (path ? "done" : "failed"),
        sheetPath: path,
        sheetFailReason: c.sheetFailReason ?? null,
      };
    });
  }
  const ids = Array.isArray(r.characterIds) ? r.characterIds : [];
  return ids.map((id): ThemeCharacter => ({ kind: "example", id }));
}

/** 古い形で保存された作品も読めるように、足りない欄を埋める */
export function normTheme(raw: ThemeDoc): ThemeDoc {
  const r = raw as Partial<ThemeDoc> & Pick<ThemeDoc, "id" | "text" | "createdAt">;
  const characters = normCharacters(r);
  return {
    id: r.id,
    // 空文字・非文字列は未設定（フィールド無し）として扱う
    ...(typeof r.title === "string" && r.title.trim() ? { title: r.title } : {}),
    text: r.text ?? "",
    artStyle: isArtStyleId(r.artStyle) ? r.artStyle : DEFAULT_ART_STYLE,
    characters,
    characterIds: Array.isArray(r.characterIds) ? r.characterIds : [],
    authorUid: r.authorUid ?? "",
    authorName: r.authorName ?? "",
    createdAt: r.createdAt,
    updatedAt: r.updatedAt ?? r.createdAt,
    confirmed: Array.isArray(r.confirmed) ? r.confirmed : [],
    slotOpenedAt: r.slotOpenedAt ?? r.createdAt,
    slotDoneCount: r.slotDoneCount ?? 0,
    slotFirstDoneAt: r.slotFirstDoneAt ?? null,
    sheetRetries: r.sheetRetries ?? 0,
    sheetsConfirmed: r.sheetsConfirmed ?? !characters.some((c) => c.kind === "custom"),
  };
}

/** 古い形（votes の欄）で保存された候補も読めるように、足りない欄を埋める */
export function normNode(raw: NodeDoc): NodeDoc {
  const r = raw as NodeDoc & { votes?: number };
  const { votes, ...rest } = r;
  return {
    ...rest,
    likes: r.likes ?? votes ?? 0,
    nopes: r.nopes ?? 0,
    reasons: r.reasons ?? emptyReasons(),
    slotOpen: r.slotOpen === true,
    doneAt: r.doneAt ?? null,
  };
}

/** いいねの割合（0票は0） */
export function likeRatio(n: Pick<NodeDoc, "likes" | "nopes">): number {
  const total = n.likes + n.nopes;
  return total === 0 ? 0 : n.likes / total;
}

/** 勝ちの順: いいねが多い → いいねの割合が高い → 早く描いた → id が小さい */
export function compareCandidates(a: NodeDoc, b: NodeDoc): number {
  return (
    b.likes - a.likes ||
    likeRatio(b) - likeRatio(a) ||
    a.createdAt - b.createdAt ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** done の候補から勝ちを1本選ぶ。done が無ければ null */
export function pickWinner(nodes: NodeDoc[]): NodeDoc | null {
  return [...nodes].filter((n) => n.status === "done").sort(compareCandidates)[0] ?? null;
}

/** 募集中のページ（通し番号 slot）の候補と、完成の数・最初の完成の時刻 */
function slotStats(nodes: NodeDoc[], slot: number) {
  const candidates = nodes.filter((n) => n.slotOpen && n.depth === slot);
  const done = candidates.filter((n) => n.status === "done");
  let firstDoneAt: number | null = null;
  for (const n of done) {
    const at = n.doneAt ?? n.createdAt;
    if (firstDoneAt === null || at < firstDoneAt) firstDoneAt = at;
  }
  return { candidates, done, doneCount: done.length, firstDoneAt };
}

// ---- 入力の確かめ ----

/** 検証を通ったキャラ（パーツのキャラの id と見た目の文は、このあとサーバーが作る） */
export type ValidCharacter =
  | { kind: "example"; id: string }
  | { kind: "custom"; name: string; parts: CharacterParts; note: string };

/** 改行・復帰・タブなどの制御文字、行区切り・段落区切り（通常の空白は含まない） */
const CONTROL_CHARS = /[\p{Cc}\p{Zl}\p{Zp}]/u;

/** 作品名の確かめ。1〜20字（trim 後）。制御文字は不可 */
function checkTitle(v: string): string {
  const title = v.trim();
  if (len(title) < 1) throw new ApiError(400, "作品名を入れてください");
  if (CONTROL_CHARS.test(title)) throw new ApiError(400, "作品名に改行などの文字は使えません");
  if (len(title) > TITLE_MAX) throw new ApiError(400, `作品名は${TITLE_MAX}字までです`);
  return title;
}

export function validateThemeInput(body: unknown): {
  title?: string;
  text: string;
  artStyle: ThemeDoc["artStyle"];
  characters: ValidCharacter[];
} {
  if (!isRecord(body)) throw new ApiError(400, "送る内容の形が正しくありません");
  // 作品名は任意。無い・空なら未設定（送られたら 1〜20字）
  if (body.title != null && typeof body.title !== "string") throw new ApiError(400, "作品名の形が正しくありません");
  const title = typeof body.title === "string" && body.title.trim() !== "" ? checkTitle(body.title) : undefined;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (len(text) < 1) throw new ApiError(400, "物語の軸を入れてください");
  if (len(text) > THEME_TEXT_MAX) throw new ApiError(400, `物語の軸は${THEME_TEXT_MAX}字までです`);
  if (!isArtStyleId(body.artStyle)) throw new ApiError(400, "絵柄の指定が正しくありません");
  // characters（例の id の文字列、または { name, parts, note? }）。旧形式の characterIds だけでも受ける
  const raw = body.characters ?? body.characterIds;
  if (!Array.isArray(raw)) throw new ApiError(400, "キャラの指定が正しくありません");
  if (raw.length < 1 || raw.length > 2) throw new ApiError(400, "キャラは1〜2体選んでください");
  const characters: ValidCharacter[] = raw.map((c): ValidCharacter => {
    if (typeof c === "string") {
      if (!findCharacter(c)) throw new ApiError(400, "知らないキャラが指定されています");
      return { kind: "example", id: c };
    }
    if (!isRecord(c)) throw new ApiError(400, "キャラの指定が正しくありません");
    const name = typeof c.name === "string" ? c.name.trim() : "";
    if (len(name) < 1) throw new ApiError(400, "キャラの名前を入れてください");
    if (CONTROL_CHARS.test(name)) throw new ApiError(400, "キャラの名前に改行などの文字は使えません");
    if (len(name) > CHARACTER_NAME_MAX) throw new ApiError(400, `キャラの名前は${CHARACTER_NAME_MAX}字までです`);
    if (c.note !== undefined && typeof c.note !== "string") throw new ApiError(400, "キャラの自由記入の形が正しくありません");
    const note = (c.note ?? "").trim();
    if (len(note) > CHARACTER_NOTE_MAX) {
      throw new ApiError(400, `キャラの自由記入は${CHARACTER_NOTE_MAX}字までです`);
    }
    if (!validateParts(c.parts)) throw new ApiError(400, "キャラのパーツの指定が正しくありません");
    return { kind: "custom", name, parts: c.parts, note };
  });
  const exampleIds = characters.flatMap((c) => (c.kind === "example" ? [c.id] : []));
  if (new Set(exampleIds).size !== exampleIds.length) throw new ApiError(400, "同じキャラを2回は選べません");
  return { ...(title ? { title } : {}), text, artStyle: body.artStyle, characters };
}

export function validateRenameInput(body: unknown): string {
  if (!isRecord(body)) throw new ApiError(400, "送る内容の形が正しくありません");
  if (typeof body.title !== "string") throw new ApiError(400, "作品名を入れてください");
  return checkTitle(body.title);
}

export function validateNodeInput(body: unknown): {
  nodeId: string;
  themeId: string;
  slot: number;
  lines: string[];
} {
  if (!isRecord(body)) throw new ApiError(400, "送る内容の形が正しくありません");
  const { nodeId, themeId, slot, lines } = body;
  if (typeof nodeId !== "string" || !UUID_RE.test(nodeId)) {
    throw new ApiError(400, "候補の名前（nodeId）が正しくありません");
  }
  if (typeof themeId !== "string" || !themeId) throw new ApiError(400, "作品の指定が正しくありません");
  if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0) {
    throw new ApiError(400, "描くページの指定が正しくありません");
  }
  if (!Array.isArray(lines) || lines.length !== 4 || lines.some((l) => typeof l !== "string")) {
    throw new ApiError(400, "セリフはコマ1〜4の4つで送ってください");
  }
  const trimmed = (lines as string[]).map((l) => l.trim());
  if (trimmed.some((l) => len(l) > LINE_MAX)) throw new ApiError(400, `各コマのセリフは${LINE_MAX}字までです`);
  if (trimmed.every((l) => l === "")) throw new ApiError(400, "少なくとも1つのコマにセリフを書いてください");
  return { nodeId, themeId, slot, lines: trimmed };
}

function validateNodeId(v: unknown): string {
  if (typeof v !== "string" || !v) throw new ApiError(400, "候補の指定が正しくありません");
  return v;
}

export function validateVoteInput(body: unknown): { nodeId: string; like: boolean } {
  if (!isRecord(body)) throw new ApiError(400, "送る内容の形が正しくありません");
  const nodeId = validateNodeId(body.nodeId);
  if (typeof body.like !== "boolean") throw new ApiError(400, "評価（いいね・いまいち）の指定が正しくありません");
  return { nodeId, like: body.like };
}

export function validateReasonInput(body: unknown): { nodeId: string; reason: VoteReason } {
  if (!isRecord(body)) throw new ApiError(400, "送る内容の形が正しくありません");
  const nodeId = validateNodeId(body.nodeId);
  const { reason } = body;
  if (typeof reason !== "string" || !(VOTE_REASONS as readonly string[]).includes(reason)) {
    throw new ApiError(400, "理由の指定が正しくありません");
  }
  return { nodeId, reason: reason as VoteReason };
}

// ---- 画面に返す形 ----

export function toCharacterViews(characters: ThemeCharacter[], themeId: string): CharacterView[] {
  return characters.map(
    (c): CharacterView =>
      c.kind === "example"
        ? { kind: "example", id: c.id }
        : {
            kind: "custom",
            name: c.name,
            appearance: c.appearance,
            sheetStatus: c.sheetStatus,
            sheetUrl:
              c.sheetStatus === "done" && c.sheetPath
                ? `/api/themes/${themeId}/sheets/${c.id}?v=${encodeURIComponent(c.sheetPath)}`
                : null,
            sheetFailReason: c.sheetFailReason,
          },
  );
}

/**
 * 作品のキャラ → 生成が受け取る形。例は固定の4体（public の設定画）。
 * パーツは名前と見た目の文に、確定した設定画の画像（sheets: キャラ id → 画像）を付ける
 */
export function toGeneratorCharacters(characters: ThemeCharacter[], sheets?: Map<string, ImageData>): Character[] {
  return characters.flatMap((c): Character[] => {
    if (c.kind === "custom") {
      const sheetImage = sheets?.get(c.id);
      return [{ id: c.id, name: c.name, appearance: c.appearance, ...(sheetImage ? { sheetImage } : {}) }];
    }
    const ex = findCharacter(c.id);
    return ex ? [ex] : [];
  });
}

export function toSummary(t: ThemeDoc): ThemeSummary {
  const pageCount = t.confirmed.length;
  const first = t.confirmed[0];
  return {
    id: t.id,
    ...(t.title ? { title: t.title } : {}),
    text: t.text,
    artStyle: t.artStyle,
    characters: toCharacterViews(t.characters, t.id),
    characterIds: t.characterIds,
    authorName: t.authorName,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    sheetsConfirmed: t.sheetsConfirmed,
    sheetRetriesLeft: Math.max(0, SHEET_RETRY_MAX - t.sheetRetries),
    coverUrl: first ? imageUrlOf(first) : null,
    pageCount,
    completedEpisodes: Math.floor(pageCount / PAGES_PER_EPISODE),
    slot: { ...pagePosition(pageCount), doneCount: t.slotDoneCount },
  };
}

function toCandidate(n: NodeDoc, now: number, user: User | null, vote: VoteDoc | null): CandidateView {
  const e = effectiveNode(n, now);
  const mine = !!user && e.authorUid === user.uid;
  const visible = mine || !!vote;
  return {
    nodeId: e.id,
    status: e.status,
    failReason: e.failReason,
    deadlineAt: e.deadlineAt,
    lines: e.lines,
    authorName: e.authorName,
    mine,
    imageUrl: e.status === "done" && e.imagePath ? imageUrlOf(e.id) : null,
    likes: visible ? e.likes : null,
    reasons: visible ? { ...e.reasons } : null,
    myVote: vote ? { like: vote.like, reason: vote.reason } : null,
    createdAt: e.createdAt,
  };
}

function shuffle<T>(xs: T[], random: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ---- 本体 ----

export function createService(deps: ServiceDeps) {
  const { store, images, generator, config } = deps;
  const now = deps.now ?? (() => Date.now());
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const random = deps.random ?? Math.random;
  const confirmAfterMs = (config.confirmAfterSec ?? envSec("CONFIRM_AFTER_SEC", 300)) * 1000;
  const confirmSingleAfterMs = (config.confirmSingleAfterSec ?? envSec("CONFIRM_SINGLE_AFTER_SEC", 1800)) * 1000;

  /** 自動で決まる時刻: ①（2本以上・最初の完成から confirmAfter）と ②（1本以上・confirmSingleAfter）の早い方 */
  function dueAt(doneCount: number, firstDoneAt: number | null): number | null {
    if (doneCount < 1 || firstDoneAt === null) return null;
    const single = firstDoneAt + confirmSingleAfterMs;
    return doneCount >= 2 ? Math.min(firstDoneAt + confirmAfterMs, single) : single;
  }

  async function loadTheme(themeId: string): Promise<ThemeDoc> {
    const raw = await store.get<ThemeDoc>("themes", themeId);
    if (!raw) throw new ApiError(404, "作品が見つかりません");
    return settleExpiredSheets(normTheme(raw), now());
  }

  /** 期限切れの generating の設定画を、失敗として保存する（読むときに呼ぶ。無ければ何もしない） */
  async function settleSheets(themeId: string): Promise<void> {
    const t = now();
    await store.runTransaction(async (tx) => {
      const raw = await tx.get<ThemeDoc>("themes", themeId);
      if (!raw) return;
      const cur = normTheme(raw);
      const next = settleExpiredSheets(cur, t);
      if (next !== cur) tx.set("themes", themeId, next);
    });
  }

  /**
   * ページを決める（1つのトランザクション）。`confirmed.length` が expectedLen のままの時だけ。
   * auto は ①② を満たす時だけ、manual は done が1本以上なら（無ければ 400）。決めたら true。
   */
  async function confirmSlot(themeId: string, expectedLen: number, mode: "auto" | "manual"): Promise<boolean> {
    return store.runTransaction(async (tx) => {
      const raw = await tx.get<ThemeDoc>("themes", themeId);
      if (!raw) throw new ApiError(404, "作品が見つかりません");
      const theme = normTheme(raw);
      if (theme.confirmed.length !== expectedLen) return false;
      const nodes = (await tx.nodesByTheme(themeId)).map(normNode);
      const t = now();
      const st = slotStats(nodes, expectedLen);
      if (mode === "auto") {
        const due = dueAt(st.doneCount, st.firstDoneAt);
        if (due === null || t < due) return false;
      } else if (st.doneCount === 0) {
        throw new ApiError(400, "完成した候補がまだありません");
      }
      const winner = pickWinner(st.done);
      if (!winner) return false;
      // ここから書き込み。募集中の候補は全部締める（generating のままの物は期限切れの扱い）
      for (const n of nodes.filter((x) => x.slotOpen)) {
        const patch: Record<string, unknown> = { slotOpen: false };
        if (n.status === "generating" && t > n.deadlineAt) {
          patch.status = "failed";
          patch.failReason = "時間切れ";
        }
        tx.update("nodes", n.id, patch);
      }
      tx.update("themes", themeId, {
        confirmed: [...theme.confirmed, winner.id],
        slotOpenedAt: t,
        updatedAt: t,
        slotDoneCount: 0,
        slotFirstDoneAt: null,
      });
      return true;
    });
  }

  /** 作品の写し（slotDoneCount・slotFirstDoneAt）で ①② を安く確かめ、満たしていれば決める */
  async function maybeAutoConfirm(theme: ThemeDoc): Promise<boolean> {
    const due = dueAt(theme.slotDoneCount, theme.slotFirstDoneAt);
    if (due === null || now() < due) return false;
    return confirmSlot(theme.id, theme.confirmed.length, "auto");
  }

  async function listThemes(): Promise<ThemeSummary[]> {
    return (await store.listThemes(50)).map((r) => settleExpiredSheets(normTheme(r), now())).map(toSummary);
  }

  async function createTheme(user: User, body: unknown): Promise<ThemeSummary> {
    const input = validateThemeInput(body);
    // パーツのキャラは「名前: 見た目の文（パーツ＋自由記入）」で、作品名・物語の軸と一緒に1回で確かめる。
    // 既存キャラの想起は名前とパーツの組み合わせで起きるので、パーツも文チェックに渡す（Codex レビュー #66 R1）
    const genId = newId();
    const sheetDeadlineAt = now() + config.genTimeoutSec * 1000;
    const characters = input.characters.map(
      (c): ThemeCharacter =>
        c.kind === "example"
          ? c
          : {
              kind: "custom",
              id: newId(),
              name: c.name,
              parts: c.parts,
              note: c.note,
              appearance: buildAppearance(c.parts, c.note),
              sheetStatus: "generating",
              sheetPath: null,
              sheetFailReason: null,
              sheetGenId: genId,
              sheetDeadlineAt,
            },
    );
    const customs = characters.flatMap((c) => (c.kind === "custom" ? [c] : []));
    const modText = [input.title, input.text, ...customs.map((c) => `${c.name}: ${c.appearance}`)].filter(Boolean).join("\n");
    const mod = await generator.moderateTheme(modText);
    if (!mod.ok) throw new ApiError(400, mod.reason);
    const sheetCount = customs.length;
    const t = now();
    const theme: ThemeDoc = {
      id: newId(),
      ...(input.title ? { title: input.title } : {}),
      text: input.text,
      artStyle: input.artStyle,
      characters,
      characterIds: characters.flatMap((c) => (c.kind === "example" ? [c.id] : [])),
      authorUid: user.uid,
      authorName: user.name,
      createdAt: t,
      updatedAt: t,
      confirmed: [],
      slotOpenedAt: t,
      slotDoneCount: 0,
      slotFirstDoneAt: null,
      sheetRetries: 0,
      // 例のキャラだけの作品は設定画が要らないので最初から確定済み
      sheetsConfirmed: sheetCount === 0,
    };
    // 設定画の枚数ぶんを全体の上限に確かめて+1してから作品を作る（足りなければ作品を作らない）
    await store.runTransaction(async (tx) => {
      if (sheetCount > 0) await chargeGlobal(tx, t, sheetCount);
      tx.set("themes", theme.id, theme);
    });
    if (sheetCount === 0) return toSummary(theme);
    await generateSheets(theme, characters.flatMap((c) => (c.kind === "custom" ? [c.id] : [])), genId);
    return toSummary(await loadTheme(theme.id));
  }

  /** 設定画の枚数ぶんを全体の1日の上限に数える（1人1日の上限には数えない）。足りなければ 429 */
  async function chargeGlobal(tx: Tx, t: number, n: number): Promise<void> {
    const allKey = `all_${jstDate(t)}`;
    const allCount = (await tx.get<UsageDoc>("usage", allKey))?.count ?? 0;
    if (allCount + n > config.limitGlobal) {
      throw new ApiError(429, `今日の全体の生成の上限（${config.limitGlobal}回）に達したので、設定画を描けません`);
    }
    tx.set<UsageDoc>("usage", allKey, { id: allKey, count: allCount + n });
  }

  /** 指定したキャラの設定画を並べて描き、結果を作品に書く（トランザクションの外で AI を呼ぶ。失敗しても投げない） */
  async function generateSheets(
    theme: ThemeDoc,
    characterIds: string[],
    /** この呼び出しの生成 ID。保存されている sheetGenId と一致するキャラにだけ結果を書く */
    genId: string,
    /** 描き直しのとき true。1枚もできなかったら、押した時に予約した描き直し1回を戻す */
    refundRetryIfAllFailed = false,
  ): Promise<void> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), Math.max(1, config.genTimeoutSec - 10) * 1000);
    type Outcome = { status: "done"; path: string } | { status: "failed"; reason: string };
    const outcomes = new Map<string, Outcome>();
    try {
      await Promise.all(
        characterIds.map(async (id) => {
          const c = theme.characters.find((x) => x.kind === "custom" && x.id === id);
          if (!c || c.kind !== "custom") return;
          let outcome: Outcome;
          try {
            const r = await generator.generateSheet(
              { character: { name: c.name, appearance: c.appearance }, artStyle: artStylePrompt(theme.artStyle) },
              ac.signal,
            );
            if (r.status === "done") {
              try {
                // 描き直しても前の画像の URL が使われないよう、毎回新しい名前で置く
                outcome = { status: "done", path: await images.put(`sheet_${id}_${newId()}`, r.image) };
              } catch (e) {
                console.error("sheet save failed", e instanceof Error ? e.message : e);
                outcome = { status: "failed", reason: "画像の保存に失敗しました" };
              }
            } else {
              outcome = { status: "failed", reason: r.reason };
            }
          } catch (e) {
            console.error("generateSheet failed", e instanceof Error ? e.message : e);
            outcome = { status: "failed", reason: ac.signal.aborted ? "時間切れ" : "生成に失敗しました" };
          }
          outcomes.set(id, outcome);
        }),
      );
    } finally {
      clearTimeout(timer);
    }
    await store.runTransaction(async (tx) => {
      const raw = await tx.get<ThemeDoc>("themes", theme.id);
      if (!raw) return;
      const t = now();
      // 期限切れの generating は先に失敗に確定する（予約は一度だけ戻る）。期限後の成功は書かない
      const base = normTheme(raw);
      const cur = settleExpiredSheets(base, t);
      if (cur.sheetsConfirmed) {
        if (cur !== base) tx.set("themes", theme.id, cur);
        return;
      }
      const applied: Outcome[] = [];
      const characters = cur.characters.map((c): ThemeCharacter => {
        const o = c.kind === "custom" ? outcomes.get(c.id) : undefined;
        if (c.kind !== "custom" || !o || c.sheetStatus !== "generating" || c.sheetGenId !== genId) return c;
        applied.push(o);
        if (o.status === "done") return { ...c, sheetStatus: "done", sheetPath: o.path, sheetFailReason: null };
        if (c.sheetPath) return { ...c, sheetStatus: "done", sheetFailReason: o.reason };
        return { ...c, sheetStatus: "failed", sheetPath: null, sheetFailReason: o.reason };
      });
      // 全体の日次上限は戻さない（課金されたか分からない失敗も数えて、無限の再試行を防ぐ）
      if (applied.length === 0) {
        if (cur !== base) tx.set("themes", theme.id, cur);
        return;
      }
      const anyDone = applied.some((o) => o.status === "done");
      const sheetRetries =
        refundRetryIfAllFailed && !anyDone ? Math.max(0, cur.sheetRetries - 1) : cur.sheetRetries;
      tx.set("themes", theme.id, { ...cur, characters, sheetRetries });
    });
  }

  /**
   * 設定画の描き直し（始めた人だけ・1作品2回まで）。1回の押下で1回と数える。
   * 同時押しで2回を超えないよう、押した時点で確かめて +1 しておき（予約）、
   * 全部失敗したら generateSheets が -1 で戻す。
   */
  async function retrySheets(user: User, themeId: string, body: unknown): Promise<ThemeDetail2> {
    if (body !== undefined && body !== null && !isRecord(body)) throw new ApiError(400, "送る内容の形が正しくありません");
    const characterId = isRecord(body) ? body.characterId : undefined;
    if (characterId !== undefined && characterId !== null && typeof characterId !== "string") {
      throw new ApiError(400, "キャラの指定が正しくありません");
    }
    const t = now();
    const genId = newId();
    const targets = await store.runTransaction(async (tx) => {
      const raw = await tx.get<ThemeDoc>("themes", themeId);
      if (!raw) throw new ApiError(404, "作品が見つかりません");
      const theme = settleExpiredSheets(normTheme(raw), t);
      if (theme.authorUid !== user.uid) throw new ApiError(403, "設定画を描き直せるのは作品を始めた人だけです");
      if (theme.sheetsConfirmed) throw new ApiError(409, "設定画はもう確定しました");
      if (theme.sheetRetries >= SHEET_RETRY_MAX) throw new ApiError(409, `描き直しは${SHEET_RETRY_MAX}回までです`);
      const customs = theme.characters.flatMap((c) => (c.kind === "custom" ? [c] : []));
      const ids = typeof characterId === "string" ? customs.filter((c) => c.id === characterId) : customs;
      if (ids.length === 0) throw new ApiError(404, "描き直せるキャラが見つかりません");
      await chargeGlobal(tx, t, ids.length);
      const set = new Set(ids.map((c) => c.id));
      tx.set("themes", themeId, {
        ...theme,
        sheetRetries: theme.sheetRetries + 1,
        characters: theme.characters.map(
          (c): ThemeCharacter =>
            c.kind === "custom" && set.has(c.id)
              ? {
                  ...c,
                  sheetStatus: "generating",
                  sheetFailReason: null,
                  sheetGenId: genId,
                  sheetDeadlineAt: t + config.genTimeoutSec * 1000,
                  sheetReserved: true,
                }
              : c,
        ),
      });
      return [...set];
    });
    await generateSheets(await loadTheme(themeId), targets, genId, true);
    return getTheme(themeId, user);
  }

  /** 設定画を確定する（始めた人だけ。パーツのキャラ全部が done の時だけ） */
  async function confirmSheets(user: User, themeId: string): Promise<ThemeDetail2> {
    await store.runTransaction(async (tx) => {
      const raw = await tx.get<ThemeDoc>("themes", themeId);
      if (!raw) throw new ApiError(404, "作品が見つかりません");
      const theme = normTheme(raw);
      if (theme.authorUid !== user.uid) throw new ApiError(403, "設定画を確定できるのは作品を始めた人だけです");
      if (theme.sheetsConfirmed) return;
      const ready = theme.characters.every((c) => c.kind !== "custom" || (c.sheetStatus === "done" && !!c.sheetPath));
      if (!ready) throw new ApiError(409, "設定画がそろっていません。描き直すか、できあがるまで待ってください");
      tx.set("themes", themeId, { ...theme, sheetsConfirmed: true, updatedAt: now() });
    });
    return getTheme(themeId, user);
  }

  /** 設定画の画像（誰でも見られる）。できていなければ null */
  async function getSheetImage(themeId: string, characterId: string): Promise<ImageData | null> {
    const raw = await store.get<ThemeDoc>("themes", themeId);
    if (!raw) return null;
    const c = normTheme(raw).characters.find((x) => x.kind === "custom" && x.id === characterId);
    if (!c || c.kind !== "custom" || c.sheetStatus !== "done" || !c.sheetPath) return null;
    return images.get(c.sheetPath);
  }

  async function getTheme(themeId: string, user: User | null): Promise<ThemeDetail2> {
    await settleSheets(themeId);
    let theme = await loadTheme(themeId);
    let nodes = (await store.listNodesByTheme(themeId)).map(normNode);
    {
      const st = slotStats(nodes, theme.confirmed.length);
      const due = dueAt(st.doneCount, st.firstDoneAt);
      if (due !== null && now() >= due && (await confirmSlot(themeId, theme.confirmed.length, "auto"))) {
        theme = await loadTheme(themeId);
        nodes = (await store.listNodesByTheme(themeId)).map(normNode);
      }
    }
    const votes = user ? await store.listVotesByUserAndTheme(user.uid, themeId) : [];
    const t = now();
    const myVotes = new Map(votes.map((v) => [v.nodeId, v]));
    const byId = new Map(nodes.map((n) => [n.id, n]));

    const pages: PageView[] = [];
    theme.confirmed.forEach((id, index) => {
      const n = byId.get(id);
      if (!n) return;
      pages.push({
        nodeId: n.id,
        index,
        ...pagePosition(index),
        lines: n.lines,
        authorName: n.authorName,
        imageUrl: imageUrlOf(n.id),
        createdAt: n.createdAt,
      });
    });

    const index = theme.confirmed.length;
    const st = slotStats(nodes, index);
    const isMine = (n: NodeDoc) => !!user && n.authorUid === user.uid;
    const mine = !!user && theme.authorUid === user.uid;
    const slot: SlotView = {
      index,
      ...pagePosition(index),
      doneCount: st.doneCount,
      candidates: st.candidates
        .filter((n) => isMine(n) || myVotes.has(n.id))
        .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
        .map((n) => toCandidate(n, t, user, myVotes.get(n.id) ?? null)),
      toSwipeCount: st.done.filter((n) => !isMine(n) && !myVotes.has(n.id)).length,
      canConfirm: mine && st.doneCount >= 1,
      autoConfirmAt: dueAt(st.doneCount, st.firstDoneAt),
    };
    const summary = toSummary(theme);
    return {
      theme: { ...summary, slot: { ...summary.slot, doneCount: st.doneCount }, mine },
      pages,
      slot,
    };
  }

  /** 作品名を付ける・直す（始めた人だけ。文チェックあり） */
  async function renameTheme(user: User, themeId: string, body: unknown): Promise<ThemeDetail2> {
    const title = validateRenameInput(body);
    const theme = await loadTheme(themeId);
    if (theme.authorUid !== user.uid) throw new ApiError(403, "作品名を付けられるのは作品を始めた人だけです");
    // 付け直しの回数: 作品ごと・JST の日ごと。生成回数の usage（user_ / all_）とは別のキー。
    // 文チェックの前に読んで、上限なら moderateTheme を呼ばずに 429。数えるのは成功して書く時だけ（NG の回は数えない）。
    const renameKey = `rename_${themeId}_${jstDate(now())}`;
    const tooMany = () =>
      new ApiError(429, `今日の作品名の付け直しの上限（${RENAME_LIMIT_PER_DAY}回）に達しました。明日また直せます`);
    if (((await store.get<UsageDoc>("usage", renameKey))?.count ?? 0) >= RENAME_LIMIT_PER_DAY) throw tooMany();
    const mod = await generator.moderateTheme(`${title}\n${theme.text}`);
    if (!mod.ok) throw new ApiError(400, mod.reason);
    await store.runTransaction(async (tx) => {
      const cur = await tx.get<ThemeDoc>("themes", themeId);
      if (!cur) throw new ApiError(404, "作品が見つかりません");
      const used = (await tx.get<UsageDoc>("usage", renameKey))?.count ?? 0;
      if (used >= RENAME_LIMIT_PER_DAY) throw tooMany(); // 同時に送られた分の取りこぼし防止
      tx.set<UsageDoc>("usage", renameKey, { id: renameKey, count: used + 1 });
      tx.set("themes", themeId, { ...cur, title });
    });
    return getTheme(themeId, user);
  }

  /** 作品を始めた人が締めて決める（③） */
  async function confirm(user: User, themeId: string): Promise<ThemeDetail2> {
    const theme = await loadTheme(themeId);
    if (theme.authorUid !== user.uid) throw new ApiError(403, "作品を始めた人だけがページを決められます");
    await confirmSlot(themeId, theme.confirmed.length, "manual");
    return getTheme(themeId, user);
  }

  async function viewCandidate(nodeId: string, user: User): Promise<CandidateView> {
    const [n, v] = await Promise.all([
      store.get<NodeDoc>("nodes", nodeId),
      store.get<VoteDoc>("votes", `${nodeId}_${user.uid}`),
    ]);
    if (!n) throw new ApiError(404, "候補が見つかりません");
    return toCandidate(normNode(n), now(), user, v);
  }

  async function createNode(user: User, body: unknown): Promise<CandidateView> {
    const input = validateNodeInput(body);
    const pre = await store.get<ThemeDoc>("themes", input.themeId);
    if (pre) await maybeAutoConfirm(normTheme(pre));

    // 1つのトランザクションで: 二重送信・ページ・1人1本の確認、期限切れの掃除、回数の確認と+1、generating で作成
    const started = await store.runTransaction(async (tx) => {
      const t = now();
      const existing = await tx.get<NodeDoc>("nodes", input.nodeId);
      if (existing) {
        if (existing.authorUid !== user.uid) throw new ApiError(409, "この候補の名前は既に使われています");
        return null; // 何もしない
      }
      const rawTheme = await tx.get<ThemeDoc>("themes", input.themeId);
      if (!rawTheme) throw new ApiError(404, "作品が見つかりません");
      const theme = normTheme(rawTheme);
      if (!theme.sheetsConfirmed) throw new ApiError(409, "設定画の確認が終わるまで描けません");
      if (input.slot < theme.confirmed.length) throw new ApiError(409, "このページはもう決まりました");
      if (input.slot > theme.confirmed.length) throw new ApiError(409, "このページはまだ募集していません");
      const themeNodes = (await tx.nodesByTheme(input.themeId)).map(normNode);
      const already = themeNodes.some((n) => {
        if (n.authorUid !== user.uid || !n.slotOpen || n.depth !== input.slot) return false;
        const s = effectiveNode(n, t).status;
        return s === "generating" || s === "done";
      });
      if (already) throw new ApiError(409, "このページにはもう描きました");
      const parentId = theme.confirmed[theme.confirmed.length - 1] ?? null;
      const parent = parentId ? (themeNodes.find((n) => n.id === parentId) ?? null) : null;
      const day = jstDate(t);
      const userKey = `${user.uid}_${day}`;
      const allKey = `all_${day}`;
      const userUsage = await tx.get<UsageDoc>("usage", userKey);
      const allUsage = await tx.get<UsageDoc>("usage", allKey);

      // ここから書き込み
      for (const n of themeNodes) {
        if (n.status === "generating" && t > n.deadlineAt) {
          tx.update("nodes", n.id, { status: "failed", failReason: "時間切れ" });
        }
      }
      const userCount = userUsage?.count ?? 0;
      const allCount = allUsage?.count ?? 0;
      if (userCount >= config.limitPerUser) {
        throw new ApiError(429, `1人1日の生成の上限（${config.limitPerUser}回）に達しました。明日また試してください`);
      }
      if (allCount >= config.limitGlobal) {
        throw new ApiError(429, `今日の全体の生成の上限（${config.limitGlobal}回）に達しました`);
      }
      tx.set<UsageDoc>("usage", userKey, { id: userKey, count: userCount + 1 });
      tx.set<UsageDoc>("usage", allKey, { id: allKey, count: allCount + 1 });
      const node: NodeDoc = {
        id: input.nodeId,
        themeId: input.themeId,
        parentId,
        depth: input.slot,
        lines: input.lines,
        status: "generating",
        deadlineAt: t + config.genTimeoutSec * 1000,
        failReason: null,
        imagePath: null,
        likes: 0,
        nopes: 0,
        reasons: emptyReasons(),
        slotOpen: true,
        doneAt: null,
        authorUid: user.uid,
        authorName: user.name,
        createdAt: t,
      };
      tx.set("nodes", node.id, node);
      return { node, theme, parent };
    });

    if (!started) return viewCandidate(input.nodeId, user);
    const { node, theme, parent } = started;

    // トランザクションの外で生成する
    // パーツのキャラは確定した設定画の画像を参照画像に付ける
    // 1枚でも取れなければ、参照画像なしで描かず画像 AI を呼ばずに failed にする
    const sheets = new Map<string, ImageData>();
    let sheetMissing = false;
    await Promise.all(
      theme.characters.map(async (c) => {
        if (c.kind !== "custom" || !c.sheetPath) return;
        const img = await images.get(c.sheetPath).catch(() => null);
        if (img) sheets.set(c.id, img);
        else sheetMissing = true;
      }),
    );
    if (sheetMissing) {
      console.error("character sheet unreadable", node.id);
      // 生成回数（user_ / all_）は戻さない: 課金されたか分からない失敗と同じく、無限の再試行を防ぐ（ADR 0012）
      await store.runTransaction(async (tx) => {
        const rawCur = await tx.get<NodeDoc>("nodes", node.id);
        if (!rawCur) return;
        const cur = normNode(rawCur);
        if (cur.status !== "generating" || now() >= cur.deadlineAt || !cur.slotOpen) return;
        tx.update("nodes", node.id, { status: "failed", failReason: "キャラの設定画を読めませんでした" });
      });
      return viewCandidate(node.id, user);
    }
    const characters = toGeneratorCharacters(theme.characters, sheets);
    let prevImage: ImageData | undefined;
    if (parent?.imagePath) {
      prevImage = (await images.get(parent.imagePath).catch(() => null)) ?? undefined;
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), Math.max(1, config.genTimeoutSec - 10) * 1000);
    let result: GenerateResult;
    try {
      result = await generator.generate(
        {
          themeText: theme.text,
          ...(theme.title ? { title: theme.title } : {}),
          artStyle: artStylePrompt(theme.artStyle),
          position: pagePosition(node.depth),
          prevLines: parent?.lines,
          characters,
          lines: node.lines,
          prevImage,
        },
        ac.signal,
      );
    } catch (e) {
      console.error("generate failed", e instanceof Error ? e.message : e);
      result = { status: "failed", reason: ac.signal.aborted ? "時間切れ" : "生成に失敗しました" };
    } finally {
      clearTimeout(timer);
    }

    let imagePath: string | null = null;
    if (result.status === "done") {
      try {
        imagePath = await images.put(node.id, result.image);
      } catch (e) {
        console.error("image save failed", e instanceof Error ? e.message : e);
        result = { status: "failed", reason: "画像の保存に失敗しました" };
      }
    }

    // 「まだ generating かつ deadlineAt 前かつ募集中」の時だけ書き込む
    const final = result;
    await store.runTransaction(async (tx) => {
      const rawCur = await tx.get<NodeDoc>("nodes", node.id);
      const rawTheme = await tx.get<ThemeDoc>("themes", node.themeId);
      if (!rawCur) return;
      const cur = normNode(rawCur);
      const t = now();
      if (cur.status !== "generating" || t >= cur.deadlineAt || !cur.slotOpen) return;
      if (final.status === "done") {
        tx.update("nodes", node.id, { status: "done", imagePath, failReason: null, doneAt: t });
        tx.set<NodePrivateDoc>("nodePrivate", node.id, { id: node.id, panels: final.panels });
        if (rawTheme) {
          const th = normTheme(rawTheme);
          if (th.confirmed.length === cur.depth) {
            tx.update("themes", th.id, {
              slotDoneCount: th.slotDoneCount + 1,
              slotFirstDoneAt: th.slotFirstDoneAt ?? t,
              updatedAt: t,
            });
          }
        }
      } else {
        tx.update("nodes", node.id, { status: final.status, failReason: final.reason });
      }
    });

    return viewCandidate(node.id, user);
  }

  /** 評価の山: 募集中で完成した、自分のでない、まだ評価していない候補。最大20枚・呼ぶたびにばらばらの順 */
  async function deck(user: User, themeId?: string): Promise<DeckCard[]> {
    const themes = new Map<string, ThemeDoc>();
    const loadThemes = async (ids: string[]) => {
      const raws = await store.getMany<ThemeDoc>("themes", ids);
      raws.forEach((r) => {
        if (r) themes.set(r.id, normTheme(r));
      });
    };

    let open = (await store.listOpenDoneNodes(themeId)).map(normNode);
    await loadThemes([...new Set(open.map((n) => n.themeId))]);
    // 決まる条件を満たした作品はその場で決める
    const changed = await Promise.all([...themes.values()].map((th) => maybeAutoConfirm(th)));
    if (changed.some(Boolean)) {
      themes.clear();
      open = (await store.listOpenDoneNodes(themeId)).map(normNode);
      await loadThemes([...new Set(open.map((n) => n.themeId))]);
    }

    const others = open.filter((n) => {
      const th = themes.get(n.themeId);
      return n.authorUid !== user.uid && !!th && n.depth === th.confirmed.length;
    });
    const votes = await store.getMany<VoteDoc>(
      "votes",
      others.map((n) => `${n.id}_${user.uid}`),
    );
    const pick = shuffle(
      others.filter((_, i) => !votes[i]),
      random,
    ).slice(0, DECK_MAX);

    const prevIds = [
      ...new Set(
        pick
          .map((n) => themes.get(n.themeId)!.confirmed.at(-1))
          .filter((id): id is string => typeof id === "string"),
      ),
    ];
    const prevDocs = await store.getMany<NodeDoc>("nodes", prevIds);
    const prev = new Map<string, NodeDoc>();
    prevDocs.forEach((d) => {
      if (d) prev.set(d.id, d);
    });

    return pick.map((n) => {
      const th = themes.get(n.themeId)!;
      const lastId = th.confirmed.at(-1);
      const p = lastId ? prev.get(lastId) : undefined;
      return {
        nodeId: n.id,
        themeId: th.id,
        ...(th.title ? { themeTitle: th.title } : {}),
        themeTextHead: textHead(th.text),
        characters: toCharacterViews(th.characters, th.id),
        characterIds: th.characterIds,
        ...pagePosition(n.depth),
        lines: n.lines,
        authorName: n.authorName,
        imageUrl: imageUrlOf(n.id),
        prevPage: p ? { imageUrl: imageUrlOf(p.id), lines: p.lines } : null,
      };
    });
  }

  /** いいね／いまいち。1人1回 */
  async function vote(user: User, body: unknown): Promise<CandidateView> {
    const input = validateVoteInput(body);
    const pre = await store.get<NodeDoc>("nodes", input.nodeId);
    if (pre) {
      const th = await store.get<ThemeDoc>("themes", pre.themeId);
      if (th) await maybeAutoConfirm(normTheme(th));
    }
    const voteId = `${input.nodeId}_${user.uid}`;
    await store.runTransaction(async (tx) => {
      const raw = await tx.get<NodeDoc>("nodes", input.nodeId);
      const existing = await tx.get<VoteDoc>("votes", voteId);
      if (!raw) throw new ApiError(404, "候補が見つかりません");
      const node = normNode(raw);
      if (node.authorUid === user.uid) throw new ApiError(400, "自分の候補は評価できません");
      if (node.status !== "done") throw new ApiError(400, "完成していない候補は評価できません");
      if (!node.slotOpen) throw new ApiError(400, "このページはもう決まりました");
      if (existing) throw new ApiError(409, "この候補はもう評価しました");
      tx.set<VoteDoc>("votes", voteId, {
        id: voteId,
        nodeId: node.id,
        themeId: node.themeId,
        uid: user.uid,
        like: input.like,
        reason: null,
        createdAt: now(),
      });
      tx.update("nodes", node.id, input.like ? { likes: node.likes + 1 } : { nopes: node.nopes + 1 });
    });
    return viewCandidate(input.nodeId, user);
  }

  /** いいねした票に理由を付ける（付け直し可） */
  async function setReason(user: User, body: unknown): Promise<CandidateView> {
    const input = validateReasonInput(body);
    const voteId = `${input.nodeId}_${user.uid}`;
    await store.runTransaction(async (tx) => {
      const raw = await tx.get<NodeDoc>("nodes", input.nodeId);
      const v = await tx.get<VoteDoc>("votes", voteId);
      if (!raw) throw new ApiError(404, "候補が見つかりません");
      if (!v) throw new ApiError(404, "この候補はまだ評価していません");
      if (!v.like) throw new ApiError(400, "理由はいいねした候補にだけ付けられます");
      if (v.reason === input.reason) return;
      const node = normNode(raw);
      const reasons = { ...node.reasons };
      if (v.reason) reasons[v.reason] = Math.max(0, reasons[v.reason] - 1);
      reasons[input.reason] += 1;
      tx.update("votes", voteId, { reason: input.reason });
      tx.update("nodes", node.id, { reasons });
    });
    return viewCandidate(input.nodeId, user);
  }

  /** 評価を1つ戻す（そのページが決まる前だけ） */
  async function unvote(user: User, nodeIdRaw: unknown): Promise<CandidateView> {
    const nodeId = validateNodeId(nodeIdRaw);
    // 決まる時刻を過ぎていたら先に決める（vote と同じ。過ぎた後に戻して勝ちが変わるのを防ぐ）
    const pre = await store.get<NodeDoc>("nodes", nodeId);
    if (pre) {
      const th = await store.get<ThemeDoc>("themes", pre.themeId);
      if (th) await maybeAutoConfirm(normTheme(th));
    }
    const voteId = `${nodeId}_${user.uid}`;
    await store.runTransaction(async (tx) => {
      const raw = await tx.get<NodeDoc>("nodes", nodeId);
      const v = await tx.get<VoteDoc>("votes", voteId);
      if (!raw) throw new ApiError(404, "候補が見つかりません");
      if (!v) throw new ApiError(404, "この候補はまだ評価していません");
      const node = normNode(raw);
      if (!node.slotOpen) throw new ApiError(400, "このページはもう決まったので戻せません");
      const patch: Record<string, unknown> = v.like
        ? { likes: Math.max(0, node.likes - 1) }
        : { nopes: Math.max(0, node.nopes - 1) };
      if (v.like && v.reason) {
        patch.reasons = { ...node.reasons, [v.reason]: Math.max(0, node.reasons[v.reason] - 1) };
      }
      tx.delete("votes", voteId);
      tx.update("nodes", node.id, patch);
    });
    return viewCandidate(nodeId, user);
  }

  async function getImage(nodeId: string): Promise<ImageData | null> {
    const node = await store.get<NodeDoc>("nodes", nodeId);
    if (!node || node.status !== "done" || !node.imagePath) return null;
    return images.get(node.imagePath);
  }

  return {
    listThemes,
    createTheme,
    getTheme,
    renameTheme,
    retrySheets,
    confirmSheets,
    getSheetImage,
    confirm,
    createNode,
    deck,
    vote,
    setReason,
    unvote,
    getImage,
    characters: CHARACTERS,
  };
}

export type Service = ReturnType<typeof createService>;
