// 描く。中身は画面で読む（呼び出しは src/lib/client/api.ts に集める）
import { WriteForm } from "@/components/WriteForm";

export const metadata = { title: "ページを描く | つづきコマ" };

export default async function WritePage({ params }: { params: Promise<{ themeId: string }> }) {
  const { themeId } = await params;
  return <WriteForm key={themeId} themeId={themeId} />;
}
