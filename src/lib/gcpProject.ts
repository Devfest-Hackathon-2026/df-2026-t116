// GCP の案件名を env から探す。App Hosting は FIREBASE_CONFIG（projectId 入り）を自動で入れるが、
// GOOGLE_CLOUD_PROJECT を入れるかは公式に書かれていないので、両方を見る。
export function gcpProject(): string | undefined {
  const direct = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  if (direct) return direct;
  const raw = process.env.FIREBASE_CONFIG;
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { projectId?: unknown };
    return typeof parsed.projectId === "string" && parsed.projectId ? parsed.projectId : undefined;
  } catch {
    return undefined;
  }
}
