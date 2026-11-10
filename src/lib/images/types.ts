export interface ImageData {
  bytes: Uint8Array;
  mime: string;
}

/** 画像の置き場。画面には直接読ませず、必ず GET /api/images/[nodeId] から返す。 */
export interface ImageStore {
  /** 保存して、置いた場所（imagePath）を返す */
  put(nodeId: string, image: ImageData): Promise<string>;
  get(path: string): Promise<ImageData | null>;
}

export function extForMime(mime: string): string {
  if (mime === "image/svg+xml") return "svg";
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "bin";
}
