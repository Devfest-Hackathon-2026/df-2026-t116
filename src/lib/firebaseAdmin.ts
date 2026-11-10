// サーバー側の firebase-admin。引数の資格情報は渡さず ADC で動かす（鍵ファイルは使わない）。
import { getApps, initializeApp, type App } from "firebase-admin/app";
import { gcpProject } from "./gcpProject";

export function storageBucketName(): string | undefined {
  if (process.env.STORAGE_BUCKET) return process.env.STORAGE_BUCKET;
  const project = gcpProject();
  return project ? `${project}.firebasestorage.app` : undefined;
}

export function getAdminApp(): App {
  const apps = getApps();
  if (apps.length > 0) return apps[0]!;
  const bucket = storageBucketName();
  return initializeApp(bucket ? { storageBucket: bucket } : undefined);
}
