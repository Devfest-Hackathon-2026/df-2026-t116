// 作品のページ。中身は画面で読む（呼び出しは src/lib/client/api.ts に集める）
import { ThemeClient } from "@/components/ThemeClient";

export default async function ThemePage({ params }: { params: Promise<{ themeId: string }> }) {
  const { themeId } = await params;
  return <ThemeClient key={themeId} themeId={themeId} />;
}
