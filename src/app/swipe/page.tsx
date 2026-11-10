// 評価する（?theme= でその作品だけ）
import { SwipeDeck } from "@/components/SwipeDeck";

export const metadata = { title: "評価する | つづきコマ" };

export default async function SwipePage({ searchParams }: { searchParams: Promise<{ theme?: string | string[] }> }) {
  const sp = await searchParams;
  const themeId = typeof sp.theme === "string" && sp.theme ? sp.theme : null;
  return <SwipeDeck key={themeId ?? "all"} themeId={themeId} />;
}
