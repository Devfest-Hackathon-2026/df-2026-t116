import { getService, handle, mustUser } from "@/lib/server";
import { ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";
// 設定画の生成を同じ要求の中で待つ（GEN_TIMEOUT_SEC 既定120秒。App Hosting の上限5分の内側）
export const maxDuration = 300;

/** 始めた人だけ。体は任意 { characterId? } → ThemeDetail2。1作品2回まで */
export async function POST(req: Request, ctx: { params: Promise<{ themeId: string }> }) {
  return handle(async () => {
    const { themeId } = await ctx.params;
    const user = await mustUser(req);
    const text = await req.text();
    let body: unknown;
    if (text.trim() !== "") {
      try {
        body = JSON.parse(text);
      } catch {
        throw new ApiError(400, "送る内容が JSON ではありません");
      }
    }
    const svc = await getService();
    return svc.retrySheets(user, themeId, body);
  });
}
