import { getService, handle, mustUser } from "@/lib/server";

export const dynamic = "force-dynamic";

/** ?themeId= 任意 → { cards: DeckCard[] } */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await mustUser(req);
    const themeId = new URL(req.url).searchParams.get("themeId") || undefined;
    const svc = await getService();
    return { cards: await svc.deck(user, themeId) };
  });
}
