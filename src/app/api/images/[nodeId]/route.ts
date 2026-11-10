import { getService } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ nodeId: string }> }) {
  try {
    const { nodeId } = await ctx.params;
    const svc = await getService();
    const img = await svc.getImage(nodeId);
    if (!img) return Response.json({ error: "画像が見つかりません" }, { status: 404 });
    return new Response(new Uint8Array(img.bytes), {
      status: 200,
      headers: {
        "Content-Type": img.mime,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        // SVG の中のスクリプトを動かさない
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (e) {
    console.error("image error", e instanceof Error ? e.message : e);
    return Response.json({ error: "画像を読めませんでした" }, { status: 500 });
  }
}
