// 環境変数から部品を選んで Service を組み立てる（ルートから使う）。
// Next はルートごとにモジュールが分かれる事があるので、1つにまとめるため globalThis に置く。
import { requireUser, resolveUser } from "./auth";
import { FakeGenerator } from "./generator/fake";
import type { ComicGenerator } from "./generator/types";
import { MemoryImageStore } from "./images/memory";
import type { ImageStore } from "./images/types";
import { createService, type Service } from "./service";
import { MemoryStore } from "./store/memory";
import type { Store } from "./store/types";
import { ApiError, isApiError, type User } from "./types";

function intEnv(name: string, def: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : def;
}

export function dataBackend(): "memory" | "firestore" {
  return process.env.DATA_BACKEND === "firestore" ? "firestore" : "memory";
}

/** 画像の置き場。既定は DATA_BACKEND に合わせる（memory→memory、firestore→storage） */
function imageBackend(): "memory" | "storage" {
  const v = process.env.IMAGE_BACKEND;
  if (v === "memory" || v === "storage") return v;
  return dataBackend() === "firestore" ? "storage" : "memory";
}

const g = globalThis as unknown as { __t116Service?: Promise<Service> };

async function build(): Promise<Service> {
  let store: Store;
  if (dataBackend() === "firestore") {
    const { FirestoreStore } = await import("./store/firestore");
    store = new FirestoreStore();
  } else {
    store = new MemoryStore();
  }
  let images: ImageStore;
  if (imageBackend() === "storage") {
    const { FirebaseImageStore } = await import("./images/storage");
    images = new FirebaseImageStore();
  } else {
    images = new MemoryImageStore();
  }
  let generator: ComicGenerator;
  if (process.env.GENERATOR === "vertex") {
    // vertex（@google/genai）はこの時だけ読む。ビルド時や fake の時は GCP に触らない
    const { VertexGenerator } = await import("./generator/vertex");
    generator = new VertexGenerator();
  } else {
    generator = new FakeGenerator();
  }
  return createService({
    store,
    images,
    generator,
    config: {
      limitPerUser: intEnv("LIMIT_PER_USER", 10),
      limitGlobal: intEnv("LIMIT_GLOBAL", 120),
      genTimeoutSec: intEnv("GEN_TIMEOUT_SEC", 120),
    },
  });
}

export function getService(): Promise<Service> {
  if (!g.__t116Service) {
    g.__t116Service = build().catch((e) => {
      g.__t116Service = undefined;
      throw e;
    });
  }
  return g.__t116Service;
}

export async function currentUser(req: Request): Promise<User | null> {
  return resolveUser(req.headers, {
    dataBackend: dataBackend(),
    nodeEnv: process.env.NODE_ENV,
    verifyIdToken: async (token) => {
      const [{ getAuth }, { getAdminApp }] = await Promise.all([
        import("firebase-admin/auth"),
        import("./firebaseAdmin"),
      ]);
      const d = await getAuth(getAdminApp()).verifyIdToken(token);
      return { uid: d.uid, name: typeof d.name === "string" ? d.name : undefined };
    },
  });
}

export async function mustUser(req: Request): Promise<User> {
  return requireUser(await currentUser(req));
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "送る内容が JSON ではありません");
  }
}

/** ApiError は status と日本語の理由を返す。それ以外は中身を出さずに 500。 */
export async function handle(fn: () => Promise<unknown>, status = 200): Promise<Response> {
  try {
    const body = await fn();
    return Response.json(body, { status });
  } catch (e) {
    if (isApiError(e)) return Response.json({ error: e.message }, { status: e.status });
    console.error("api error", e instanceof Error ? e.message : e);
    return Response.json({ error: "サーバーで問題が起きました。少し待ってからもう一度試してください" }, { status: 500 });
  }
}
