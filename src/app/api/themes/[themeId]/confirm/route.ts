import { getService, handle, mustUser } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 作品を始めた人だけ。完成した候補が1本以上なら票で勝った候補に決める → ThemeDetail2 */
export async function POST(req: Request, ctx: { params: Promise<{ themeId: string }> }) {
  return handle(async () => {
    const { themeId } = await ctx.params;
    const user = await mustUser(req);
    const svc = await getService();
    return svc.confirm(user, themeId);
  });
}
