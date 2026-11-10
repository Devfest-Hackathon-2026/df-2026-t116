import type { CharacterView } from "@/lib/apiTypes";
import { findCharacter } from "@/lib/characters";
import { MOCK_API } from "@/lib/client/api";

// キャラの色（設定画が無い間は名前と色の丸で見せる）
const CHARACTER_COLORS: Record<string, string> = {
  mikan: "#ff9f43",
  tetsu: "#2ecc71",
  kinako: "#4aa3ff",
  hakase: "#a66bd8",
};

export function characterColor(id: string): string {
  return CHARACTER_COLORS[id] ?? "#999";
}

/** name を渡すとその頭文字を出す（パーツのキャラ。色は灰色） */
export function CharacterDot({ id, name, size = 24 }: { id: string; name?: string; size?: number }) {
  const label = name ?? findCharacter(id)?.name ?? id;
  return (
    <span
      className="char-dot"
      style={{ background: characterColor(id), color: "#1d1d1f", width: size, height: size, fontSize: Math.max(12, size * 0.5) }}
      aria-hidden="true"
    >
      {[...label][0]}
    </span>
  );
}

/** 設定画の小さな画像。作り物の時は絵が無いので灰色の箱 */
export function SheetThumb({ src, name, size = 20 }: { src: string; name: string; size?: number }) {
  if (MOCK_API) {
    return <span className="sheet-thumb sheet-thumb-empty" style={{ width: size, height: size }} aria-hidden="true" />;
  }
  return (
    <img
      className="sheet-thumb"
      src={src}
      alt={`${name}の設定画`}
      style={{ width: size, height: size }}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}

export function CharacterChips({ characters }: { characters: CharacterView[] }) {
  return (
    <span className="char-chips">
      {characters.map((c, i) =>
        c.kind === "example" ? (
          <span key={c.id} className="char-chip">
            <CharacterDot id={c.id} size={20} />
            {findCharacter(c.id)?.name ?? c.id}
          </span>
        ) : (
          <span key={`custom-${i}`} className="char-chip" title={c.appearance}>
            {c.sheetUrl ? (
              <SheetThumb src={c.sheetUrl} name={c.name} />
            ) : (
              <CharacterDot id="custom" name={c.name} size={20} />
            )}
            {c.name}
          </span>
        ),
      )}
    </span>
  );
}
