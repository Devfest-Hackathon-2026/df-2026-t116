import Link from "next/link";
import { displayTitle, textHead, type ThemeSummary } from "@/lib/apiTypes";
import { PageImage } from "./PageImage";

/** 「第2話 3/4」（今の募集中のページ） */
export function progressLabel(t: ThemeSummary): string {
  return `第${t.slot.episode}話 ${t.slot.pageInEpisode}/4`;
}

/** 表紙カード（2:3・作品名2行まで・進み具合） */
export function CoverCard({ theme }: { theme: ThemeSummary }) {
  return (
    <Link href={`/t/${theme.id}`} className="cover-card">
      <PageImage src={theme.coverUrl} alt={`${displayTitle(theme)}の表紙`} className="cover-img" />
      <span className="cover-title">{displayTitle(theme)}</span>
      {!theme.title && <span className="cover-meta">{textHead(theme.text)}</span>}
      <span className="cover-meta">
        {progressLabel(theme)}
        {theme.completedEpisodes > 0 && <span className="cover-done">完結{theme.completedEpisodes}話</span>}
      </span>
    </Link>
  );
}
