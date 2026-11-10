import { getService, handle, mustUser, readJson } from "@/lib/server";

export const dynamic = "force-dynamic";
// 設定画の生成を同じ要求の中で待つ（GEN_TIMEOUT_SEC 既定120秒。App Hosting の上限5分の内側）
export const maxDuration = 300;

/** { themes: ThemeSummary[] } 更新の新しい順・最大50（ここではページを決めない。安く返す） */
export async function GET() {
  return handle(async () => {
    const svc = await getService();
    return { themes: await svc.listThemes() };
  });
}

/** { title?, text, artStyle, characterIds } → { theme: ThemeSummary } */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await mustUser(req);
    const body = await readJson(req);
    const svc = await getService();
    return { theme: await svc.createTheme(user, body) };
  }, 201);
}
