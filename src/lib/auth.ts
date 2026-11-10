// ログインの確かめ。Authorization: Bearer <Firebase ID トークン> を verifyIdToken で確かめる。
// 手元用の抜け道: DATA_BACKEND=memory かつ NODE_ENV!=='production' の時だけ x-dev-user を受け付ける。
import { ApiError, type User } from "./types";

export interface DecodedToken {
  uid: string;
  name?: string;
}

export interface AuthOptions {
  dataBackend: string;
  nodeEnv: string | undefined;
  verifyIdToken: (token: string) => Promise<DecodedToken>;
}

export function devBypassAllowed(dataBackend: string, nodeEnv: string | undefined): boolean {
  return dataBackend === "memory" && nodeEnv !== "production";
}

/** ログインしていなければ null。トークンが不正なら 401。 */
export async function resolveUser(headers: Headers, opts: AuthOptions): Promise<User | null> {
  const authz = headers.get("authorization");
  if (authz && /^Bearer\s+/i.test(authz)) {
    const token = authz.replace(/^Bearer\s+/i, "").trim();
    try {
      const d = await opts.verifyIdToken(token);
      return { uid: d.uid, name: d.name?.trim() || "名無しさん" };
    } catch {
      throw new ApiError(401, "ログインの確認に失敗しました。もう一度ログインしてください");
    }
  }
  if (devBypassAllowed(opts.dataBackend, opts.nodeEnv)) {
    const raw = headers.get("x-dev-user");
    if (raw) {
      let name = raw;
      try {
        name = decodeURIComponent(raw);
      } catch {
        // そのまま使う
      }
      name = name.trim().slice(0, 40);
      if (name) return { uid: name, name };
    }
  }
  return null;
}

export function requireUser(user: User | null): User {
  if (!user) throw new ApiError(401, "ログインが必要です");
  return user;
}
