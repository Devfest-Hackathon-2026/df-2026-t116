"use client";
// 下に固定のタブ（ホーム／評価する／作品を始める）
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isReaderPath } from "./Header";
import { useDeckCount } from "./hooks";

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="currentColor" />
    </svg>
  );
}

function SwipeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <rect x="6" y="3" width="12" height="17" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 15.5s-3.5-2.1-3.5-4.4A1.9 1.9 0 0 1 12 10a1.9 1.9 0 0 1 3.5 1.1c0 2.3-3.5 4.4-3.5 4.4z" fill="currentColor" />
    </svg>
  );
}

function NewIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.5v9M7.5 12h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function TabBar() {
  const path = usePathname();
  const count = useDeckCount();
  if (isReaderPath(path)) return null;
  const tabs = [
    { href: "/", label: "ホーム", icon: <HomeIcon />, on: path === "/" },
    { href: "/swipe", label: "評価する", icon: <SwipeIcon />, on: path === "/swipe", badge: count },
    { href: "/new", label: "作品を始める", icon: <NewIcon />, on: path === "/new" },
  ];
  return (
    <nav className="tabbar" aria-label="メニュー">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className="tab" aria-current={t.on ? "page" : undefined}>
          <span className="tab-icon">
            {t.icon}
            {t.badge ? (
              <span className="tab-badge" aria-label={`残り${t.badge}枚`}>
                {t.badge >= 20 ? "20+" : t.badge}
              </span>
            ) : null}
          </span>
          <span className="tab-label">{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
