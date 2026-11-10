// 画面だけで試すための作り物のサーバー（NEXT_PUBLIC_MOCK_API=1 かつ本番でない時だけ api.ts から使う）。
// 中身は画面の中（ブラウザのメモリ）だけで変わり、読み直すと元に戻る。
// 絵は /api/images/{id} の URL を返すが、作り物の時は画面が灰色の箱を出す（public/ には置かない）。
import { ART_STYLES, isArtStyleId, type ArtStyleId } from "@/lib/artStyles";
import { buildAppearance, validateParts } from "@/lib/characterParts";
import { CHARACTERS } from "@/lib/characters";
import {
  PAGES_PER_EPISODE,
  pagePosition,
  textHead,
  type CandidateView,
  type DeckCard,
  type PageView,
  type PostNodeBody,
  type PostThemeBody,
  type ThemeDetail2,
  type ThemeSummary,
  type CharacterView,
} from "@/lib/apiTypes";
import type { NodeStatus, Reasons, VoteReason } from "@/lib/types";

export class MockHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const SEC = 1000;
const MIN = 60 * SEC;
/** 作り物の時刻の基準。画面に出す時刻は、すべて読み込んだ後に「今」との差で出す */
const BASE = Date.now();
/** 作り物の生成にかかる時間 */
const GENERATE_MS = 6 * SEC;

interface MockTheme {
  id: string;
  title?: string;
  text: string;
  artStyle: ArtStyleId;
  characters: CharacterView[];
  authorName: string;
  mine: boolean;
  createdAt: number;
  updatedAt: number;
  pages: { nodeId: string; lines: string[]; authorName: string; createdAt: number }[];
  /** 今の募集中のページが開いた時刻 */
  slotOpenedAt: number;
  /** 設定画の確認が済んでいなければ false（無ければ済み） */
  sheetsConfirmed?: boolean;
  /** 設定画の描き直しの残り回数（無ければ2） */
  sheetRetriesLeft?: number;
}

interface MockCandidate {
  nodeId: string;
  themeId: string;
  slot: number;
  lines: string[];
  authorName: string;
  mine: boolean;
  status: NodeStatus;
  failReason: string | null;
  likes: number;
  nopes: number;
  reasons: Reasons;
  createdAt: number;
  doneAt: number | null;
}

interface MockVote {
  like: boolean;
  reason: VoteReason | null;
}

function reasons(hiki = 0, igai = 0, chara = 0, e = 0): Reasons {
  return { hiki, igai, chara, e };
}

function page(nodeId: string, authorName: string, createdAt: number, ...lines: string[]) {
  return { nodeId, lines, authorName, createdAt };
}

const themes: MockTheme[] = [
  {
    id: "mock-pan",
    title: "空飛ぶパン屋のミカン",
    text: "焼きたてのパンを食べると少しだけ空を飛べる町。パン屋の娘ミカンは、相棒のポチローと朝ごはんを配りながら、町から消えた「はじまりの小麦」を探す。明るくてドタバタ、最後は少しだけ泣ける話。",
    artStyle: "standard",
    characters: [{ kind: "example", id: "mikan" }, { kind: "example", id: "kinako" }],
    authorName: "bob",
    mine: false,
    createdAt: BASE - 3 * 24 * 60 * MIN,
    updatedAt: BASE - 2 * MIN,
    pages: [
      page("mock-pan-1", "bob", BASE - 70 * 60 * MIN, "今日も朝ごはん配達だ！", "パンをひと口…ふわっ", "うわ、屋根より高い！", "ポチロー、しっかりつかまって"),
      page("mock-pan-2", "carol", BASE - 60 * 60 * MIN, "あれ、時計塔の上に誰かいる", "「小麦を返してほしいか？」", "あなた、だれ！？", "黒いマントの男は消えた"),
      page("mock-pan-3", "alice", BASE - 50 * 60 * MIN, "店に戻ると粉の袋が空っぽ", "お父さん、小麦が無いよ", "「はじまりの小麦が盗まれた」", "このままじゃパンが焼けない"),
      page("mock-pan-4", "bob", BASE - 40 * 60 * MIN, "わたしが取り返してくる！", "最後の1個のパンを持って", "ポチローと夜空へ飛び立つ", "第1話・おしまい…じゃない！"),
      page("mock-pan-5", "carol", BASE - 30 * 60 * MIN, "雲の上に島が浮かんでいる", "島じゅうが小麦畑だ…", "「ここは空の農園さ」", "しゃべるカカシが立っていた"),
      page("mock-pan-6", "alice", BASE - 20 * 60 * MIN, "盗んだのはマントの男？", "「あいつは悪いやつじゃない」", "カカシが遠くを指さす", "島の奥に大きなかまどが"),
    ],
    slotOpenedAt: BASE - 20 * 60 * MIN,
  },
  {
    id: "mock-tokei",
    title: "ハカセと止まった時計塔",
    text: "町の時計塔が止まると、町の人も止まってしまう。動けるのは発明家のハカセと助手のテツだけ。夜明けまでに時計塔を直せるか。少しこわくて、謎ときの多い話。",
    artStyle: "mono",
    characters: [{ kind: "example", id: "hakase" }, { kind: "example", id: "tetsu" }],
    authorName: "carol",
    mine: false,
    createdAt: BASE - 2 * 24 * 60 * MIN,
    updatedAt: BASE - 30 * MIN,
    pages: [],
    slotOpenedAt: BASE - 30 * MIN,
  },
  {
    id: "mock-fue",
    title: "テツの最強ホイッスル",
    text: "笛を吹くと、聞いた人がひとつだけ本気を出せる。体育委員のテツは、運動会で負け続けるクラスを勝たせるため、笛の使いどころを考える。熱くて笑える学校の話。",
    artStyle: "shonen",
    characters: [{ kind: "example", id: "tetsu" }, { kind: "example", id: "mikan" }],
    authorName: "alice",
    mine: true,
    createdAt: BASE - 24 * 60 * MIN,
    updatedAt: BASE - 10 * MIN,
    pages: [
      page("mock-fue-1", "alice", BASE - 40 * MIN, "運動会まであと3日", "うちのクラスはまた最下位だ", "そうだ、じいちゃんの笛！", "ピーッ！みんな、本気出せ！"),
      page("mock-fue-2", "bob", BASE - 25 * MIN, "ミカンが急に走り出した", "速い！速すぎる！", "あれ…止まらないぞ！？", "笛の音が町じゅうに響く"),
    ],
    slotOpenedAt: BASE - 25 * MIN,
  },
  // 作品: パーツのキャラの設定画を確認中（自分が始めた・未確定）
  {
    id: "mock-sheet",
    title: "ねこ耳ギルドの新人",
    text: "冒険者ギルドに入ったばかりの新人と、世話焼きの先輩。依頼を受けて町を回るうちに、ギルドの古い秘密に近づいていく。",
    artStyle: "standard",
    characters: [
      { kind: "custom", name: "ノア", appearance: "ねこ耳の新人冒険者", sheetStatus: "done", sheetUrl: "/api/images/mock-sheet-noa", sheetFailReason: null },
      { kind: "custom", name: "リク", appearance: "眼鏡の世話焼きな先輩", sheetStatus: "done", sheetUrl: "/api/images/mock-sheet-riku", sheetFailReason: null },
    ],
    authorName: "あなた",
    mine: true,
    createdAt: BASE - 5 * MIN,
    updatedAt: BASE - 5 * MIN,
    pages: [],
    slotOpenedAt: BASE - 5 * MIN,
    sheetsConfirmed: false,
    sheetRetriesLeft: 2,
  },
];

const candidates: MockCandidate[] = [
  // 作品1: 第2話 3ページ目（自分は生成中）
  {
    nodeId: "mock-pan-c-mine",
    themeId: "mock-pan",
    slot: 6,
    lines: ["かまどの前に男がいた", "「小麦は焼くためじゃない」", "「この島を守るためだ」", "ミカンは言葉につまる"],
    authorName: "あなた",
    mine: true,
    status: "generating",
    failReason: null,
    likes: 0,
    nopes: 0,
    reasons: reasons(),
    createdAt: BASE - 8 * SEC,
    doneAt: null,
  },
  {
    nodeId: "mock-pan-c-1",
    themeId: "mock-pan",
    slot: 6,
    lines: ["かまどの中で何か光る", "「はじまりの小麦だ！」", "手をのばすと、熱っ！", "ポチローがしっぽで消火"],
    authorName: "carol",
    mine: false,
    status: "done",
    failReason: null,
    likes: 2,
    nopes: 1,
    reasons: reasons(1, 0, 1, 0),
    createdAt: BASE - 15 * MIN,
    doneAt: BASE - 14 * MIN,
  },
  {
    nodeId: "mock-pan-c-2",
    themeId: "mock-pan",
    slot: 6,
    lines: ["カカシが急に走り出す", "「こっちだ、ついてこい！」", "畑の下に階段が", "地下にパン工場！？"],
    authorName: "dave",
    mine: false,
    status: "done",
    failReason: null,
    likes: 1,
    nopes: 0,
    reasons: reasons(0, 1, 0, 0),
    createdAt: BASE - 12 * MIN,
    doneAt: BASE - 11 * MIN,
  },
  {
    nodeId: "mock-pan-c-3",
    themeId: "mock-pan",
    slot: 6,
    lines: ["マントの男がふり向く", "「よく来たな、ミカン」", "その顔は…お父さん！？", "「…いや、おじさんだ」"],
    authorName: "erin",
    mine: false,
    status: "done",
    failReason: null,
    likes: 3,
    nopes: 1,
    reasons: reasons(1, 2, 0, 0),
    createdAt: BASE - 10 * MIN,
    doneAt: BASE - 9 * MIN,
  },
  // 作品2: 第1話 1ページ目（自分は失敗）
  {
    nodeId: "mock-tokei-c-mine",
    themeId: "mock-tokei",
    slot: 0,
    lines: ["夜中の12時、鐘が鳴らない", "ハカセ、町が静かすぎます", "外を見ると…みんな止まってる", "「時計塔へ急ぐぞ、テツ！」"],
    authorName: "あなた",
    mine: true,
    status: "failed",
    failReason: "絵を描けませんでした。少し時間をおいて描き直してください",
    likes: 0,
    nopes: 0,
    reasons: reasons(),
    createdAt: BASE - 20 * MIN,
    doneAt: null,
  },
  {
    nodeId: "mock-tokei-c-1",
    themeId: "mock-tokei",
    slot: 0,
    lines: ["ハカセの研究所、深夜", "「できたぞ、止まらない時計だ」", "そのとき、町の灯りが消えた", "時計塔の針が…止まっている"],
    authorName: "bob",
    mine: false,
    status: "done",
    failReason: null,
    likes: 0,
    nopes: 0,
    reasons: reasons(),
    createdAt: BASE - 18 * MIN,
    doneAt: BASE - 17 * MIN,
  },
  // 作品3（自分が始めた）: 第1話 3ページ目（自分の候補は完成済み）
  {
    nodeId: "mock-fue-c-mine",
    themeId: "mock-fue",
    slot: 2,
    lines: ["もう一回吹けば止まるはず", "ピッ…ピーッ！", "今度は先生が走り出した", "「うおおお、青春だー！」"],
    authorName: "あなた",
    mine: true,
    status: "done",
    failReason: null,
    likes: 3,
    nopes: 1,
    reasons: reasons(2, 0, 1, 0),
    createdAt: BASE - 9 * MIN,
    doneAt: BASE - 8 * MIN,
  },
  {
    nodeId: "mock-fue-c-1",
    themeId: "mock-fue",
    slot: 2,
    lines: ["ミカンは校庭を10周した", "「…テツ、なにこれ！？」", "笛の説明書を読むテツ", "「効き目は1時間」…長い！"],
    authorName: "carol",
    mine: false,
    status: "done",
    failReason: null,
    likes: 1,
    nopes: 1,
    reasons: reasons(0, 0, 1, 0),
    createdAt: BASE - 7 * MIN,
    doneAt: BASE - 6 * MIN,
  },
  {
    nodeId: "mock-fue-c-2",
    themeId: "mock-fue",
    slot: 2,
    lines: ["ミカンがテツを持ち上げた", "「一緒に走るよ！」", "2人で校門を飛び出す", "町内一周マラソンの始まり"],
    authorName: "dave",
    mine: false,
    status: "done",
    failReason: null,
    likes: 2,
    nopes: 0,
    reasons: reasons(1, 1, 0, 0),
    createdAt: BASE - 5 * MIN,
    doneAt: BASE - 4 * MIN,
  },
];

/** 自分の票（作品1の1本は評価済み） */
const myVotes = new Map<string, MockVote>([["mock-pan-c-3", { like: true, reason: "igai" }]]);

let seq = 0;

function img(nodeId: string): string {
  return `/api/images/${nodeId}`;
}

function findTheme(id: string): MockTheme {
  const t = themes.find((x) => x.id === id);
  if (!t) throw new MockHttpError(404, "作品が見つかりません");
  return t;
}

function slotCandidates(t: MockTheme): MockCandidate[] {
  return candidates.filter((c) => c.themeId === t.id && c.slot === t.pages.length);
}

/** 作り物の生成: 時間がたったら完成にする */
function tick(): void {
  const now = Date.now();
  for (const c of candidates) {
    if (c.status === "generating" && c.createdAt >= BASE && now - c.createdAt >= GENERATE_MS) {
      c.status = "done";
      c.doneAt = c.createdAt + GENERATE_MS;
    }
  }
}

function autoConfirmAt(t: MockTheme): number | null {
  const done = slotCandidates(t).filter((c) => c.status === "done" && c.doneAt !== null);
  if (done.length === 0) return null;
  const first = Math.min(...done.map((c) => c.doneAt as number));
  // 作り物では「5分」の代わりに、残りが分かる程度の値にする
  return done.length >= 2 ? Math.max(first + 5 * MIN, BASE + 4 * MIN) : first + 30 * MIN;
}

function pageViews(t: MockTheme): PageView[] {
  return t.pages.map((p, index) => ({
    nodeId: p.nodeId,
    index,
    ...pagePosition(index),
    lines: [...p.lines],
    authorName: p.authorName,
    imageUrl: img(p.nodeId),
    createdAt: p.createdAt,
  }));
}

function summary(t: MockTheme): ThemeSummary {
  const s = pagePosition(t.pages.length);
  return {
    id: t.id,
    ...(t.title ? { title: t.title } : {}),
    text: t.text,
    artStyle: t.artStyle,
    characters: t.characters.map((c) => ({ ...c })),
    characterIds: t.characters.flatMap((c) => (c.kind === "example" ? [c.id] : [])),
    authorName: t.authorName,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    sheetsConfirmed: t.sheetsConfirmed ?? true,
    sheetRetriesLeft: t.sheetRetriesLeft ?? 2,
    coverUrl: t.pages[0] ? img(t.pages[0].nodeId) : null,
    pageCount: t.pages.length,
    completedEpisodes: Math.floor(t.pages.length / PAGES_PER_EPISODE),
    slot: { ...s, doneCount: slotCandidates(t).filter((c) => c.status === "done").length },
  };
}

function candidateView(c: MockCandidate): CandidateView {
  const vote = myVotes.get(c.nodeId) ?? null;
  const show = c.mine || vote !== null;
  return {
    nodeId: c.nodeId,
    status: c.status,
    failReason: c.failReason,
    deadlineAt: c.createdAt + 3 * MIN,
    lines: [...c.lines],
    authorName: c.authorName,
    mine: c.mine,
    imageUrl: c.status === "done" ? img(c.nodeId) : null,
    likes: show ? c.likes : null,
    reasons: show ? { ...c.reasons } : null,
    myVote: vote ? { ...vote } : null,
    createdAt: c.createdAt,
  };
}

export function mockListThemes(): ThemeSummary[] {
  tick();
  return [...themes].sort((a, b) => b.updatedAt - a.updatedAt).map(summary);
}

export function mockGetTheme(id: string): ThemeDetail2 {
  tick();
  const t = findTheme(id);
  const cands = slotCandidates(t);
  const doneCount = cands.filter((c) => c.status === "done").length;
  return {
    theme: { ...summary(t), mine: t.mine },
    pages: pageViews(t),
    slot: {
      index: t.pages.length,
      ...pagePosition(t.pages.length),
      doneCount,
      candidates: cands.filter((c) => c.mine || myVotes.has(c.nodeId)).map(candidateView),
      toSwipeCount: cands.filter((c) => !c.mine && c.status === "done" && !myVotes.has(c.nodeId)).length,
      canConfirm: t.mine && doneCount >= 1,
      autoConfirmAt: autoConfirmAt(t),
    },
  };
}

export function mockCreateTheme(body: PostThemeBody, authorName: string): ThemeSummary {
  const title = (body.title ?? "").trim();
  const text = (body.text ?? "").trim();
  if ([...title].length > 20) throw new MockHttpError(400, "作品名は1〜20字で書いてください");
  if ([...text].length < 1 || [...text].length > 200) throw new MockHttpError(400, "物語の軸は1〜200字で書いてください");
  if (!isArtStyleId(body.artStyle)) throw new MockHttpError(400, "絵柄を選んでください");
  const list = body.characters ?? (body.characterIds ?? []);
  if (list.length < 1 || list.length > 2) throw new MockHttpError(400, "キャラを1〜2体選んでください");
  const characters = list.map((c): CharacterView => {
    if (typeof c === "string") {
      if (!CHARACTERS.some((x) => x.id === c)) throw new MockHttpError(400, "キャラを1〜2体選んでください");
      return { kind: "example", id: c };
    }
    const name = (c.name ?? "").trim();
    const note = (c.note ?? "").trim();
    if ([...name].length < 1 || [...name].length > 20) throw new MockHttpError(400, "キャラの名前は1〜20字で書いてください");
    if ([...note].length > 80) throw new MockHttpError(400, "キャラの自由記入は80字までです");
    if (!validateParts(c.parts)) throw new MockHttpError(400, "キャラのパーツを選んでください");
    return { kind: "custom", name, appearance: buildAppearance(c.parts, note), sheetStatus: "done", sheetUrl: null, sheetFailReason: null };
  });
  const now = Date.now();
  const t: MockTheme = {
    id: `mock-new-${++seq}`,
    ...(title ? { title } : {}),
    text,
    artStyle: body.artStyle ?? ART_STYLES[0].id,
    characters,
    authorName,
    mine: true,
    createdAt: now,
    updatedAt: now,
    pages: [],
    slotOpenedAt: now,
  };
  themes.push(t);
  return summary(t);
}

/** 勝ち: いいねの数 → いいねの割合 → 早く描いた方 → id */
function winner(list: MockCandidate[]): MockCandidate | undefined {
  const ratio = (c: MockCandidate) => (c.likes + c.nopes === 0 ? 0 : c.likes / (c.likes + c.nopes));
  return [...list].sort(
    (a, b) =>
      b.likes - a.likes ||
      ratio(b) - ratio(a) ||
      a.createdAt - b.createdAt ||
      (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0),
  )[0];
}

export function mockRename(id: string, raw: string): ThemeDetail2 {
  tick();
  const t = findTheme(id);
  if (!t.mine) throw new MockHttpError(403, "作品名を付けられるのは作品を始めた人だけです");
  const title = raw.trim();
  if ([...title].length < 1 || [...title].length > 20) throw new MockHttpError(400, "作品名は1〜20字で書いてください");
  t.title = title;
  return mockGetTheme(id);
}

/** 設定画の作り物: 確定すると確認済みに、描き直しは残り回数を1つ減らすだけ */
export function mockSheets(id: string, confirm = false): ThemeDetail2 {
  tick();
  const t = findTheme(id);
  if (!t.mine) throw new MockHttpError(403, "設定画を扱えるのは作品を始めた人だけです");
  if (confirm) t.sheetsConfirmed = true;
  else {
    const left = t.sheetRetriesLeft ?? 2;
    if (left <= 0) throw new MockHttpError(409, "設定画を描き直せる回数を使い切りました");
    t.sheetRetriesLeft = left - 1;
  }
  return mockGetTheme(id);
}

export function mockConfirm(id: string): ThemeDetail2 {
  tick();
  const t = findTheme(id);
  if (!t.mine) throw new MockHttpError(403, "作品を始めた人だけが締められます");
  const done = slotCandidates(t).filter((c) => c.status === "done");
  const win = winner(done);
  if (!win) throw new MockHttpError(400, "完成した候補がまだありません");
  const now = Date.now();
  t.pages.push({ nodeId: win.nodeId, lines: [...win.lines], authorName: win.authorName, createdAt: win.createdAt });
  t.updatedAt = now;
  t.slotOpenedAt = now;
  for (const c of slotCandidates(t)) if (c.nodeId !== win.nodeId && c.status === "generating") c.status = "rejected";
  // 決まった候補は slot が進むので、山からも自然に消える
  return mockGetTheme(id);
}

export function mockPostNode(body: PostNodeBody, authorName: string): CandidateView {
  tick();
  const t = findTheme(body.themeId);
  if (body.slot > t.pages.length) throw new MockHttpError(409, "このページはまだ募集していません");
  if (body.slot < t.pages.length) throw new MockHttpError(409, "このページはもう決まりました");
  const lines = (body.lines ?? []).map((l) => (l ?? "").trim());
  if (lines.length !== 4 || lines.every((l) => l === "") || lines.some((l) => [...l].length > 30)) {
    throw new MockHttpError(400, "セリフはコマ1〜4に各30字まで、1つは書いてください");
  }
  const mine = slotCandidates(t).filter((c) => c.mine);
  if (mine.some((c) => c.status === "generating" || c.status === "done")) {
    throw new MockHttpError(409, "このページにはもう描きました");
  }
  // 失敗・止められた候補は描き直しで置き換える
  for (const c of mine) candidates.splice(candidates.indexOf(c), 1);
  const now = Date.now();
  const c: MockCandidate = {
    nodeId: body.nodeId,
    themeId: t.id,
    slot: t.pages.length,
    lines,
    authorName,
    mine: true,
    status: "generating",
    failReason: null,
    likes: 0,
    nopes: 0,
    reasons: reasons(),
    createdAt: now,
    doneAt: null,
  };
  candidates.push(c);
  t.updatedAt = now;
  return candidateView(c);
}

/** 生成が終わるまでの残り（ミリ秒）。POST が返るまでの待ちに使う */
export function mockGenerateWait(nodeId: string): number {
  const c = candidates.find((x) => x.nodeId === nodeId);
  return c ? Math.max(0, c.createdAt + GENERATE_MS - Date.now()) : 0;
}

export function mockCandidate(nodeId: string): CandidateView | null {
  tick();
  const c = candidates.find((x) => x.nodeId === nodeId);
  return c ? candidateView(c) : null;
}

/** 決まったページの順は作品ごとに固定だが、山の順は作り物では固定（人ごとのばらばらは真似しない） */
export function mockDeck(themeId: string | null): DeckCard[] {
  tick();
  const out: DeckCard[] = [];
  for (const t of themes) {
    if (themeId && t.id !== themeId) continue;
    const prev = t.pages[t.pages.length - 1];
    for (const c of slotCandidates(t)) {
      if (c.mine || c.status !== "done" || myVotes.has(c.nodeId)) continue;
      out.push({
        nodeId: c.nodeId,
        themeId: t.id,
        ...(t.title ? { themeTitle: t.title } : {}),
        themeTextHead: textHead(t.text),
        characters: t.characters.map((x) => ({ ...x })),
        characterIds: t.characters.flatMap((x) => (x.kind === "example" ? [x.id] : [])),
        ...pagePosition(c.slot),
        lines: [...c.lines],
        authorName: c.authorName,
        imageUrl: img(c.nodeId),
        prevPage: prev ? { imageUrl: img(prev.nodeId), lines: [...prev.lines] } : null,
      });
    }
  }
  return out.slice(0, 20);
}

function findCandidate(nodeId: string): MockCandidate {
  const c = candidates.find((x) => x.nodeId === nodeId);
  if (!c) throw new MockHttpError(404, "候補が見つかりません");
  return c;
}

function votable(nodeId: string): MockCandidate {
  const c = findCandidate(nodeId);
  const t = findTheme(c.themeId);
  if (c.mine) throw new MockHttpError(400, "自分の候補は評価できません");
  if (c.slot !== t.pages.length) throw new MockHttpError(400, "このページはもう決まりました");
  if (c.status !== "done") throw new MockHttpError(400, "まだ完成していません");
  return c;
}

export function mockVote(nodeId: string, like: boolean): CandidateView {
  const c = votable(nodeId);
  if (myVotes.has(nodeId)) throw new MockHttpError(409, "もう評価しています");
  myVotes.set(nodeId, { like, reason: null });
  if (like) c.likes++;
  else c.nopes++;
  return candidateView(c);
}

/** 理由はページが決まった後でも付け直せる */
export function mockSetReason(nodeId: string, reason: VoteReason): CandidateView {
  const c = findCandidate(nodeId);
  const v = myVotes.get(nodeId);
  if (!v || !v.like) throw new MockHttpError(400, "いいねした候補だけ理由を付けられます");
  if (v.reason) c.reasons[v.reason]--;
  v.reason = reason;
  c.reasons[reason]++;
  return candidateView(c);
}

/** 戻す。ページが決まった後は 400 */
export function mockUndoVote(nodeId: string): CandidateView {
  const c = votable(nodeId);
  const v = myVotes.get(nodeId);
  if (!v) throw new MockHttpError(404, "評価が見つかりません");
  if (v.like) c.likes--;
  else c.nopes--;
  if (v.reason) c.reasons[v.reason]--;
  myVotes.delete(nodeId);
  return candidateView(c);
}
