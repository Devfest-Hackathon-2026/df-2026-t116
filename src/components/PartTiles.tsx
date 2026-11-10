"use client";
// パーツで作る: 1種類ぶんのタイル選択（radiogroup）。
// 見た目は CSS の色見本・手元の SVG・絵文字だけ。送る値は今までと同じ選択肢の id。
import type { ReactNode } from "react";
import { PART_KIND_LABELS, PART_OPTIONS, type PartKind } from "@/lib/characterParts";

// 髪色・服の色の見本（画面だけの飾り）
const COLOR_SWATCH: Record<string, string> = {
  black: "#2b2b2e",
  brown: "#8a5a3c",
  blonde: "#f0c75e",
  red: "#e0463c",
  blue: "#3b7dd8",
  silver: "#c4c9d0",
  pink: "#f4a6c8",
  white: "#ffffff",
  green: "#4caf6d",
  yellow: "#f7d94c",
  purple: "#8e5cc7",
};

const EMOJI: Partial<Record<PartKind, Record<string, string>>> = {
  outfit: { uniform: "🏫", casual: "👕", hoodie: "🧥", dress: "👗", kimono: "👘", labcoat: "🥼", overall: "👷" },
  age: { child: "🧒", teen: "🧑", twenties: "🧑‍💼", middle: "👨", elder: "👴" },
  species: { human: "🧑", cat: "🐱", dog: "🐶", rabbit: "🐰", robot: "🤖", elf: "🧝" },
};

const HAIR = "#4a4a50";

function HairGlyph({ id }: { id: string }) {
  const cap = <path d="M12 21a8 8 0 0 1 16 0z" fill={HAIR} />;
  let hair: ReactNode;
  switch (id) {
    case "bob":
      hair = (
        <>
          {cap}
          <rect x="11" y="20" width="4" height="10" rx="2" fill={HAIR} />
          <rect x="25" y="20" width="4" height="10" rx="2" fill={HAIR} />
        </>
      );
      break;
    case "long":
      hair = (
        <>
          {cap}
          <rect x="11" y="20" width="4" height="17" rx="2" fill={HAIR} />
          <rect x="25" y="20" width="4" height="17" rx="2" fill={HAIR} />
        </>
      );
      break;
    case "ponytail":
      hair = (
        <>
          {cap}
          <ellipse cx="32" cy="27" rx="3" ry="8" fill={HAIR} />
        </>
      );
      break;
    case "twintail":
      hair = (
        <>
          {cap}
          <ellipse cx="9" cy="28" rx="3" ry="8" fill={HAIR} />
          <ellipse cx="31" cy="28" rx="3" ry="8" fill={HAIR} />
        </>
      );
      break;
    case "curly":
      hair = (
        <>
          <circle cx="12" cy="18" r="5" fill={HAIR} />
          <circle cx="20" cy="14" r="6" fill={HAIR} />
          <circle cx="28" cy="18" r="5" fill={HAIR} />
        </>
      );
      break;
    case "buzz":
      hair = <path d="M12.5 20a7.5 7.5 0 0 1 15 0" fill="none" stroke={HAIR} strokeWidth="2" />;
      break;
    default:
      hair = (
        <>
          {cap}
          <rect x="11" y="20" width="3" height="4" fill={HAIR} />
          <rect x="26" y="20" width="3" height="4" fill={HAIR} />
        </>
      );
  }
  return (
    <svg viewBox="0 0 40 40" width="36" height="36" aria-hidden="true">
      <circle cx="20" cy="23" r="8" fill="#f6d9c0" />
      {hair}
    </svg>
  );
}

// 体型: 人影の高さと幅で違いを出す
export const BODY_SHAPE: Record<string, { h: number; w: number }> = {
  tiny: { h: 14, w: 10 },
  small: { h: 22, w: 11 },
  average: { h: 28, w: 14 },
  tall: { h: 32, w: 12 },
  sturdy: { h: 28, w: 20 },
  plump: { h: 26, w: 22 },
};

function BodyGlyph({ id }: { id: string }) {
  const s = BODY_SHAPE[id] ?? { h: 28, w: 14 };
  const headR = Math.max(3, s.w / 4);
  const bodyTop = 38 - s.h;
  return (
    <svg viewBox="0 0 40 40" width="36" height="36" aria-hidden="true">
      <circle cx="20" cy={bodyTop - headR + 1} r={headR} fill="#f6d9c0" stroke={HAIR} strokeWidth="1" />
      <rect x={20 - s.w / 2} y={bodyTop} width={s.w} height={s.h} rx={s.w / 3} fill="#9aa3b2" />
    </svg>
  );
}

function Glyph({ kind, id }: { kind: PartKind; id: string }) {
  if (kind === "hairColor" || kind === "outfitColor") {
    return <span className="part-swatch" style={{ background: COLOR_SWATCH[id] ?? "#ccc" }} aria-hidden="true" />;
  }
  if (kind === "hairStyle") return <HairGlyph id={id} />;
  if (kind === "body") return <BodyGlyph id={id} />;
  return (
    <span className="part-emoji" aria-hidden="true">
      {EMOJI[kind]?.[id] ?? "❔"}
    </span>
  );
}

interface Props {
  /** 同じ画面で重ならない名前（ラジオの name とラベルの id に使う） */
  groupId: string;
  kind: PartKind;
  value: string | undefined;
  onChange: (id: string) => void;
}

export function PartTiles({ groupId, kind, value, onChange }: Props) {
  const labelId = `${groupId}-label`;
  const current = PART_OPTIONS[kind].find((o) => o.id === value);
  return (
    <div className="field">
      <div className="field-label" id={labelId}>
        {PART_KIND_LABELS[kind]}
        <span className={`part-state${current ? "" : " none"}`}>{current ? current.label : "選んでください"}</span>
      </div>
      <div className="part-grid" role="radiogroup" aria-labelledby={labelId} aria-required="true">
        {PART_OPTIONS[kind].map((o) => (
          <label key={o.id} className={`part-tile${value === o.id ? " on" : ""}`}>
            <input
              type="radio"
              name={groupId}
              value={o.id}
              checked={value === o.id}
              onChange={() => onChange(o.id)}
              className="sr-only"
            />
            <Glyph kind={kind} id={o.id} />
            <span className="part-name">{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
