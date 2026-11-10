import { getService, handle, mustUser } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 始めた人だけ。パーツのキャラ全部の設定画ができている時だけ確定する → ThemeDetail2 */
export async function POST(req: Request, ctx: { params: Promise<{ themeId: string }> }) {
  return handle(async () => {
    const { themeId } = await ctx.params;
    const user = await mustUser(req);
    const svc = await getService();
    return svc.confirmSheets(user, themeId);
  });
}
