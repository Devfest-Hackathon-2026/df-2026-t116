"use client";
import { DEV_USER_SWITCH } from "@/lib/client/firebase";
import { useAuth } from "./AuthProvider";

export function LoginPrompt({ message }: { message: string }) {
  const { login } = useAuth();
  return (
    <div className="login-prompt">
      <p>{message}</p>
      <button type="button" className="btn" onClick={() => login(DEV_USER_SWITCH ? "alice" : undefined)}>
        ログインする
      </button>
      {DEV_USER_SWITCH && <p className="muted small">手元では右上の「手元の名前」でも切り替えられます</p>}
    </div>
  );
}
