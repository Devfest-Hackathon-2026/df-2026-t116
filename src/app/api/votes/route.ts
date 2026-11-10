import { getService, handle, mustUser, readJson } from "@/lib/server";

export const dynamic = "force-dynamic";

/** { nodeId, like } → CandidateView。2回目は 409 */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await mustUser(req);
    const body = await readJson(req);
    const svc = await getService();
    return svc.vote(user, body);
  });
}

/** { nodeId, reason } → CandidateView。いいねした票だけ（付け直し可） */
export async function PATCH(req: Request) {
  return handle(async () => {
    const user = await mustUser(req);
    const body = await readJson(req);
    const svc = await getService();
    return svc.setReason(user, body);
  });
}

/** ?nodeId= → CandidateView。そのページが決まる前だけ戻せる */
export async function DELETE(req: Request) {
  return handle(async () => {
    const user = await mustUser(req);
    const nodeId = new URL(req.url).searchParams.get("nodeId");
    const svc = await getService();
    return svc.unvote(user, nodeId);
  });
}
