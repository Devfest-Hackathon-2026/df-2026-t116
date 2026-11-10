import { LINE_LABELS } from "./labels";

/** 1ページのセリフ（コマ1〜4） */
export function Lines({ lines, authorName, dark = false }: { lines: string[]; authorName?: string; dark?: boolean }) {
  return (
    <div className={`lines${dark ? " lines-dark" : ""}`}>
      <ol>
        {LINE_LABELS.map((label, i) => (
          <li key={label}>
            <span className="line-label">{label}</span>
            <span className={lines[i] ? "" : "line-empty"}>{lines[i] || "（なし）"}</span>
          </li>
        ))}
      </ol>
      {authorName && <p className="credit">話：{authorName}さん　絵：AI</p>}
    </div>
  );
}
