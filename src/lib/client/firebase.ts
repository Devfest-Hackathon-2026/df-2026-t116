// 画面側のログインと API 呼び出し。
// - DATA_BACKEND=memory（手元）: Firebase を初期化せず、x-dev-user を付けて呼ぶ。
// - それ以外: Firebase Auth（Google ログイン）の ID トークンを Authorization に付けて呼ぶ。
//   NEXT_PUBLIC_FIREBASE_* があれば明示の設定で、無ければ initializeApp() 引数なし
//   （App Hosting がビルド時に入れる FIREBASE_WEBAPP_CONFIG を @firebase/util の postinstall が使う）。
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut, type Auth } from "firebase/auth";

// next.config.ts で DATA_BACKEND をビルド時に埋め込む
const DEV_MODE = (process.env.NEXT_PUBLIC_DATA_BACKEND ?? "memory") === "memory";
const DEV_USER_KEY = "t116.devUser";
const DEV_USER_EVENT = "t116-dev-user";
/** 手元の名前を切り替える選択を出すか（本番のビルドでは出さない。サーバーも NODE_ENV=production では x-dev-user を受けない） */
export const DEV_USER_SWITCH = DEV_MODE && process.env.NODE_ENV !== "production";

function explicitConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return undefined;
  return {
    apiKey,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

let auth: Auth | undefined;

function firebaseAuth(): Auth {
  if (!auth) {
    const app: FirebaseApp = getApps()[0] ?? initializeApp(explicitConfig() as never);
    auth = getAuth(app);
  }
  return auth;
}

export function isDevMode(): boolean {
  return DEV_MODE;
}

/** 手元用の名前。localStorage で切り替えられる（2人で試すため） */
export function devUser(): string {
  if (typeof window !== "undefined") {
    const v = window.localStorage.getItem(DEV_USER_KEY);
    if (v) return v;
  }
  return process.env.NEXT_PUBLIC_DEV_USER || "dev-user";
}

export interface SignedInUser {
  uid: string;
  name: string;
}

export async function signIn(devName?: string): Promise<SignedInUser> {
  if (DEV_MODE) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DEV_USER_KEY, devName || devUser());
      window.dispatchEvent(new Event(DEV_USER_EVENT));
    }
    const name = devUser();
    return { uid: name, name };
  }
  const cred = await signInWithPopup(firebaseAuth(), new GoogleAuthProvider());
  return { uid: cred.user.uid, name: cred.user.displayName ?? "名無しさん" };
}

export async function signOutUser(): Promise<void> {
  if (DEV_MODE) {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DEV_USER_KEY);
      window.dispatchEvent(new Event(DEV_USER_EVENT));
    }
    return;
  }
  await signOut(firebaseAuth());
}

/** ログインの状態を見張る。戻り値で見張りを止める。手元では localStorage に名前があればログイン中とみなす */
export function watchUser(cb: (user: SignedInUser | null) => void): () => void {
  if (DEV_MODE) {
    const emit = () => {
      const name = window.localStorage.getItem(DEV_USER_KEY);
      cb(name ? { uid: name, name } : null);
    };
    emit();
    window.addEventListener(DEV_USER_EVENT, emit);
    window.addEventListener("storage", emit);
    return () => {
      window.removeEventListener(DEV_USER_EVENT, emit);
      window.removeEventListener("storage", emit);
    };
  }
  return onAuthStateChanged(firebaseAuth(), (u) =>
    cb(u ? { uid: u.uid, name: u.displayName ?? "名無しさん" } : null),
  );
}

export async function getIdToken(): Promise<string | null> {
  if (DEV_MODE) return null;
  const a = firebaseAuth();
  await a.authStateReady();
  return a.currentUser ? a.currentUser.getIdToken() : null;
}

/** ログインの証明を付けて fetch する */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (DEV_MODE) {
    headers.set("x-dev-user", encodeURIComponent(devUser()));
  } else {
    const token = await getIdToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
  }
  return fetch(path, { ...init, headers });
}
