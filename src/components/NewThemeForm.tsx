"use client";
// 作品を始める: 作品名・物語の軸・絵柄・キャラを決める
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ART_STYLES, DEFAULT_ART_STYLE, type ArtStyleId } from "@/lib/artStyles";
import { PartTiles } from "./PartTiles";
import {
  PART_KINDS,
  type CharacterParts,
  type PartKind,
} from "@/lib/characterParts";
import { CHARACTERS } from "@/lib/characters";
import { createTheme, failureMessage } from "@/lib/client/api";
import { useAuth } from "./AuthProvider";
import { CharacterDot } from "./CharacterChips";
import { charLen } from "./labels";
import { TEXT_MAX, TITLE_MAX, step1BlockReason } from "./newThemeSteps";
import { GEN_HINT, GenProgress } from "./GenProgress";
import { LoginPrompt } from "./LoginPrompt";

function CharacterCardImage({ id, name, sheetPath }: { id: string; name: string; sheetPath?: string }) {
  const [failed, setFailed] = useState(false);
  if (!sheetPath || failed) return <CharacterDot id={id} size={40} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="char-card-img" src={sheetPath} alt={`${name}の設定画`} onError={() => setFailed(true)} />
  );
}

const CHAR_MAX = 2;
const NAME_MAX = 20;
const NOTE_MAX = 80;

interface CustomDraft {
  name: string;
  /** 種類ごとに選んだ id（選ぶまでは空） */
  parts: Partial<CharacterParts>;
  note: string;
}

const newDraft = (): CustomDraft => ({ name: "", parts: {}, note: "" });
const draftReady = (d: CustomDraft) =>
  d.name.trim() !== "" &&
  charLen(d.name.trim()) <= NAME_MAX &&
  charLen(d.note.trim()) <= NOTE_MAX &&
  PART_KINDS.every((k) => !!d.parts[k]);

function StyleCardImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="style-art style-art-missing" aria-hidden="true" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="style-art" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
  );
}

export function NewThemeForm() {
  const { user } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [artStyle, setArtStyle] = useState<ArtStyleId>(DEFAULT_ART_STYLE);
  const [charMode, setCharMode] = useState<"example" | "custom">("example");
  const [picked, setPicked] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<CustomDraft[]>([newDraft()]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [step, setStep] = useState(1);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepMounted = useRef(false);

  // ステップを移ったら見出しへフォーカスし、ページ先頭へ戻す（表示だけの変更）
  useEffect(() => {
    if (!stepMounted.current) {
      stepMounted.current = true;
      return;
    }
    window.scrollTo(0, 0);
    headingRef.current?.focus();
  }, [step]);

  const titleLeft = TITLE_MAX - charLen(title.trim());
  const textLeft = TEXT_MAX - charLen(text.trim());
  const canSend =
    !sending &&
    titleLeft >= 0 &&
    text.trim() !== "" &&
    textLeft >= 0 &&
    (charMode === "example" ? picked.length >= 1 && picked.length <= CHAR_MAX : drafts.every(draftReady));

  function updateDraft(i: number, patch: Partial<CustomDraft>) {
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < CHAR_MAX ? [...p, id] : p));
  }

  const step1Block = step1BlockReason(title, text);
  const stepTitles = ["お話", "絵柄", "キャラ"];
  const stepNav = (n: number) => (
    <div className="new-steps-nav">
      {n > 1 && (
        <button type="button" className="btn new-steps-btn" onClick={() => setStep(n - 1)}>
          戻る
        </button>
      )}
      {n < 3 && (
        <button type="button" className="btn new-steps-btn" disabled={n === 1 && !!step1Block} onClick={() => setStep(n + 1)}>
          次へ
        </button>
      )}
      {n === 1 && step1Block && <p className="field-help new-steps-reason">{step1Block}</p>}
    </div>
  );
  const stepHeading = (n: number) => (
    <h2 className="new-steps-heading" tabIndex={-1} ref={step === n ? headingRef : undefined}>
      {n}. {stepTitles[n - 1]}
    </h2>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step < 3) {
      if (step === 1 ? !step1Block : true) setStep(step + 1);
      return;
    }
    if (!canSend) return;
    if (!user) {
      setNeedLogin(true);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const characters =
        charMode === "example"
          ? picked
          : drafts.map((d) => ({
              name: d.name.trim(),
              parts: d.parts as CharacterParts,
              ...(d.note.trim() ? { note: d.note.trim() } : {}),
            }));
      const theme = await createTheme({ ...(title.trim() ? { title: title.trim() } : {}), text: text.trim(), artStyle, characters });
      router.push(`/t/${theme.id}`);
    } catch (err) {
      setError(failureMessage(err));
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="new-form new-steps">
      <ol className="new-steps-bar" aria-label="進み具合">
        {stepTitles.map((t, i) => (
          <li key={t} className={step === i + 1 ? "on" : undefined} aria-current={step === i + 1 ? "step" : undefined}>
            {i + 1} {t}
            {step === i + 1 && <span className="sr-only">（今のステップ）</span>}
          </li>
        ))}
      </ol>
      <div hidden={step !== 1}>
      {stepHeading(1)}
      <div className="field">
        <label className="field-label" htmlFor="theme-title">
          作品名（任意）
          <span className={`counter${titleLeft < 0 ? " over" : ""}`}>あと{titleLeft}字</span>
        </label>
        <p className="field-help" id="theme-title-help">
          あとから付けられます。空のままなら「無題」と表示されます。
        </p>
        <p className="field-example" id="theme-title-example">
          例: 空飛ぶパン屋のミカン
        </p>
        <input
          id="theme-title"
          aria-describedby="theme-title-help theme-title-example"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoComplete="off"
          aria-invalid={titleLeft < 0}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="theme-text">
          物語の軸
          <span className={`counter${textLeft < 0 ? " over" : ""}`}>あと{textLeft}字</span>
        </label>
        <p className="field-help" id="theme-text-help">
          世界・主人公・目指す所・雰囲気を書くと、描く人が続けやすくなります。
        </p>
        <p className="field-example" id="theme-text-example">
          例: 魔法が使えない少年が、魔法の学園で一番の発明家を目指す。舞台は空に浮かぶ島の町。明るくて少しドタバタな雰囲気。
        </p>
        <textarea
          id="theme-text"
          className="input textarea"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-describedby="theme-text-help theme-text-example"
          aria-invalid={textLeft < 0}
        />
      </div>

      {stepNav(1)}
      </div>

      <div hidden={step !== 2}>
      {stepHeading(2)}
      <fieldset className="field">
        <legend className="field-label">絵柄（全ページ共通）</legend>
        <div className="style-grid">
          {ART_STYLES.map((s) => (
            <label key={s.id} className={`style-card${artStyle === s.id ? " on" : ""}`}>
              <input
                type="radio"
                name="artStyle"
                value={s.id}
                checked={artStyle === s.id}
                onChange={() => setArtStyle(s.id)}
                className="sr-only"
              />
              <StyleCardImage src={s.image} />
              <span className="style-name">{s.label}</span>
              <span className="style-desc">{s.description}</span>
              {artStyle === s.id && (
                <span className="style-check" aria-hidden="true">
                  ✓ 選択中
                </span>
              )}
            </label>
          ))}
        </div>
      </fieldset>

      {stepNav(2)}
      </div>

      <div hidden={step !== 3}>
      {stepHeading(3)}
      <fieldset className="field">
        <legend className="field-label">
          キャラ
          <span className="counter">
            {charMode === "example" ? picked.length : drafts.length}/{CHAR_MAX}体（1〜2体）
          </span>
        </legend>
        <div className="char-mode seg" role="radiogroup" aria-label="キャラの決め方">
          {(
            [
              ["example", "例から選ぶ"],
              ["custom", "パーツで作る"],
            ] as const
          ).map(([mode, label]) => (
            <label key={mode} className={`seg-item${charMode === mode ? " on" : ""}`}>
              <input
                type="radio"
                name="charMode"
                value={mode}
                checked={charMode === mode}
                onChange={() => setCharMode(mode)}
                className="sr-only"
              />
              <span className="seg-label">
                {charMode === mode && <span aria-hidden="true">✓ </span>}
                {label}
              </span>
            </label>
          ))}
        </div>
        <p className="char-mode-desc" aria-live="polite">
          {charMode === "example" ? "用意した4体から、1〜2体を選ぶ" : "髪や服などのパーツを組み合わせて作る"}
        </p>

        {charMode === "example" ? (
          <div className="char-grid">
            {CHARACTERS.map((c) => {
              const on = picked.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className="char-card"
                  aria-pressed={on}
                  disabled={!on && picked.length >= CHAR_MAX}
                  onClick={() => toggle(c.id)}
                >
                  <CharacterCardImage id={c.id} name={c.name} sheetPath={c.sheetPath} />
                  <span className="char-card-name">{c.name}</span>
                  <span className="char-card-desc">{c.appearance}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div>
            <p className="field-help">
              細かい所は短く書きます。実在の作品のキャラに似せないでください。設定画は作品を始めたあとに作ります。
            </p>
            {drafts.map((d, i) => {
              const nameLeft = NAME_MAX - charLen(d.name.trim());
              const noteLeft = NOTE_MAX - charLen(d.note.trim());
              return (
                <div key={i} className="field">
                  <label className="field-label" htmlFor={`char-name-${i}`}>
                    {i + 1}体目の名前
                    <span className={`counter${nameLeft < 0 ? " over" : ""}`}>あと{nameLeft}字</span>
                  </label>
                  <input
                    id={`char-name-${i}`}
                    className="input"
                    value={d.name}
                    onChange={(e) => updateDraft(i, { name: e.target.value })}
                    autoComplete="off"
                    aria-invalid={nameLeft < 0}
                  />
                  {PART_KINDS.map((k: PartKind) => (
                    <PartTiles
                      key={k}
                      groupId={`char-${i}-${k}`}
                      kind={k}
                      value={d.parts[k]}
                      onChange={(id) => updateDraft(i, { parts: { ...d.parts, [k]: id } })}
                    />
                  ))}
                  <label className="field-label" htmlFor={`char-note-${i}`}>
                    短い自由記入（細かい特徴・任意）
                    <span className={`counter${noteLeft < 0 ? " over" : ""}`}>あと{noteLeft}字</span>
                  </label>
                  <p className="field-example" id={`char-note-example-${i}`}>
                    例: 丸い眼鏡をかけている
                  </p>
                  <textarea
                    id={`char-note-${i}`}
                    aria-describedby={`char-note-example-${i}`}
                    className="input textarea"
                    rows={2}
                    value={d.note}
                    onChange={(e) => updateDraft(i, { note: e.target.value })}
                    aria-invalid={noteLeft < 0}
                  />
                  {drafts.length > 1 && (
                    <button type="button" className="btn" onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}>
                      この子をやめる
                    </button>
                  )}
                </div>
              );
            })}
            {drafts.length < CHAR_MAX && (
              <button type="button" className="btn" onClick={() => setDrafts((ds) => [...ds, newDraft()])}>
                もう1体足す
              </button>
            )}
          </div>
        )}
      </fieldset>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {needLogin && !user && <LoginPrompt message="作品を始めるにはログインしてください" />}

      {sending && charMode === "custom" && (
        <GenProgress
          title="設定画を作成中です…"
          steps={["作品を受け付けた", "キャラの設定画を描いている", "保存して作品を開く"]}
          active={1}
          hint={GEN_HINT}
        />
      )}
      <button type="submit" className="btn btn-block btn-lg" disabled={!canSend}>
        {sending ? (charMode === "custom" ? "設定画を作成中…" : "送っています…") : "この作品を始める"}
      </button>
      {stepNav(3)}
      </div>
    </form>
  );
}
