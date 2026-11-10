// 作品を始める人が選ぶ絵柄。image と description は画面用、prompt は画像 AI へ渡す文。
// 自由な文にすると実在の作家・作品の名前が入りやすいので、決まった中から選ぶ。
export const ART_STYLES = [
  { id: "standard", label: "明るいカラー", image: "/styles/standard.webp", description: "太めの線の、明るいカラーの漫画", prompt: "明るいカラーの日本の漫画風・太めの線" },
  { id: "shonen", label: "少年漫画", image: "/styles/shonen.webp", description: "力強い線と、動きのある構図", prompt: "少年漫画風・力強い太い線・動きのある構図・効果線・はっきりしたカラー" },
  { id: "shojo", label: "少女漫画", image: "/styles/shojo.webp", description: "細い線と大きな瞳、花や光のやわらかい背景", prompt: "少女漫画風・細く繊細な線・大きく輝く瞳・花や光の柔らかい背景・淡いカラー" },
  { id: "gekiga", label: "劇画", image: "/styles/gekiga.webp", description: "濃い影と、写実的な顔立ち", prompt: "劇画風・濃い影・写実的な顔立ち・重い陰影・渋く落ち着いたカラー" },
  { id: "yuru", label: "ゆるかわ", image: "/styles/yuru.webp", description: "丸い線の、2〜3頭身", prompt: "ゆるくかわいい漫画風・丸い線・2〜3頭身・パステルカラー・シンプルな背景" },
  { id: "mono", label: "モノクロ", image: "/styles/mono.webp", description: "墨の線と、スクリーントーンの白黒", prompt: "白黒の日本の漫画風・墨の線・スクリーントーンの陰影・カラーを使わない" },
] as const;

export type ArtStyleId = (typeof ART_STYLES)[number]["id"];

export const DEFAULT_ART_STYLE: ArtStyleId = "standard";

export function isArtStyleId(v: unknown): v is ArtStyleId {
  return typeof v === "string" && ART_STYLES.some((s) => s.id === v);
}

export function artStylePrompt(id: string | undefined): string {
  return (ART_STYLES.find((s) => s.id === id) ?? ART_STYLES[0]).prompt;
}
