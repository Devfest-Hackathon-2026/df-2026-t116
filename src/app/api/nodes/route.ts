import { getService, handle, mustUser, readJson } from "@/lib/server";

export const dynamic = "force-dynamic";
// 生成を同じ要求の中で待つ（GEN_TIMEOUT_SEC 既定120秒。App Hosting の上限5分の内側）
export const maxDuration = 300;

/** { nodeId, themeId, slot, lines } → CandidateView */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await mustUser(req);
    const body = await readJson(req);
    const svc = await getService();
    return svc.createNode(user, body);
  });
}
