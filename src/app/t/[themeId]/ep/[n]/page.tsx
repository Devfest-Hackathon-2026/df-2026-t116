// 読む画面。中身は画面で読む（呼び出しは src/lib/client/api.ts に集める）
import { notFound } from "next/navigation";
import { ReaderClient } from "@/components/ReaderClient";

export default async function EpisodePage({ params }: { params: Promise<{ themeId: string; n: string }> }) {
  const { themeId, n } = await params;
  const episode = Number(n);
  if (!Number.isInteger(episode) || episode < 1) notFound();
  return <ReaderClient key={`${themeId}-${episode}`} themeId={themeId} episode={episode} />;
}
