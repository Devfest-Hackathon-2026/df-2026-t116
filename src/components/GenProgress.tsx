// AI の生成中に出す進捗。正確なパーセントは分からないので、偽の 0–100% は出さない。
// 段階の列挙と、動くバー、目安の時間だけを出す。段階は時間で勝手に進めない
// （サーバーが返す状態は「生成中」だけで、最後で止まる偽の進捗になるため）。

export function GenProgress({
  title,
  steps,
  active,
  elapsedSec,
  hint,
}: {
  title: string;
  steps: string[];
  /** 今の段階（steps の添字）。これより前は済み、これより後はまだ */
  active: number;
  elapsedSec?: number | null;
  hint: string;
}) {
  return (
    <div className="gen-progress" role="status">
      <p className="gen-title">
        <span className="pen" aria-hidden="true">
          ✎
        </span>
        {title}
        {elapsedSec != null && <span className="tabular gen-sec">{elapsedSec}秒</span>}
      </p>
      <div className="gen-bar" aria-hidden="true">
        <span className="gen-bar-fill" />
      </div>
      <ol className="gen-steps">
        {steps.map((s, i) => (
          <li key={s} className={i < active ? "is-done" : i === active ? "is-active" : undefined}>
            <span aria-hidden="true">{i < active ? "✓" : i === active ? "●" : "○"}</span> {s}
          </li>
        ))}
      </ol>
      <p className="small muted">{hint}</p>
    </div>
  );
}

export const GEN_HINT = "通常 1〜2 分かかることがあります。";
