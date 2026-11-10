"use client";
// 1ページ（2:3）の絵。作り物の時は絵が無いので、同じ形の灰色の箱を出す。
import { MOCK_API } from "@/lib/client/api";

export function PageImage({
  src,
  alt,
  className = "",
  eager = false,
}: {
  src: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  if (!src || MOCK_API) {
    return (
      <div className={`page-img page-img-empty ${className}`} role="img" aria-label={alt}>
        <span aria-hidden="true">{src ? "絵（作り物）" : "まだ絵がありません"}</span>
      </div>
    );
  }
  return (
    <img
      className={`page-img ${className}`}
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
    />
  );
}

/** 次に出す絵を先に読んでおく（作り物の時は何もしない） */
export function preloadImage(src: string | null | undefined): void {
  if (!src || MOCK_API || typeof window === "undefined") return;
  const img = new Image();
  img.src = src;
  img.decode().catch(() => {
    // 読めなくても表示の時にもう一度読む
  });
}
