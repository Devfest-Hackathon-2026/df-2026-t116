import { currentUser, getService, handle, mustUser, readJson } from "@/lib/server";

export const dynamic = "force-dynamic";

/** ThemeDetail2（決まる条件を満たしていればその場で決めてから返す） */
export async function GET(req: Request, ctx: { params: Promise<{ themeId: string }> }) {
  return handle(async () => {
    const { themeId } = await ctx.params;
    const user = await currentUser(req);
    const svc = await getService();
    return svc.getTheme(themeId, user);
  });
}

/** { title } → ThemeDetail2（始めた人だけ。作品名を付ける・直す） */
export async function PATCH(req: Request, ctx: { params: Promise<{ themeId: string }> }) {
  return handle(async () => {
    const { themeId } = await ctx.params;
    const user = await mustUser(req);
    const body = await readJson(req);
    const svc = await getService();
    return svc.renameTheme(user, themeId, body);
  });
}
