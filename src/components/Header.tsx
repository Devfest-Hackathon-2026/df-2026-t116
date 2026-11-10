"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEV_USER_SWITCH } from "@/lib/client/firebase";
import { useAuth } from "./AuthProvider";

const DEV_NAMES = ["alice", "bob", "carol"];

/** 読む画面（/t/{id}/ep/{n}）では上の帯もタブも隠す */
export function isReaderPath(path: string | null): boolean {
  return !!path && /^\/t\/[^/]+\/ep\//.test(path);
}

export function Header() {
  const { user, ready, login, logout } = useAuth();
  const path = usePathname();
  if (isReaderPath(path)) return null;
  return (
    <header className="app-header">
      <Link href="/" className="app-title">
        <span className="app-logo" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        つづきコマ
      </Link>
      <div className="header-right">
        {DEV_USER_SWITCH ? (
          <label className="dev-switch" title="手元で試す時だけ出ます">
            <span>手元の名前</span>
            <select
              value={user?.name ?? ""}
              onChange={(e) => (e.target.value ? login(e.target.value) : logout())}
            >
              <option value="">（ログアウト）</option>
              {DEV_NAMES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              {user && !DEV_NAMES.includes(user.name) && <option value={user.name}>{user.name}</option>}
            </select>
          </label>
        ) : !ready ? null : user ? (
          <>
            <span className="user-name">{user.name}さん</span>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => logout()}>
              ログアウト
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-small" onClick={() => login()}>
            ログイン
          </button>
        )}
      </div>
    </header>
  );
}
