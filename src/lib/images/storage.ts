// Cloud Storage for Firebase に置く ImageStore（firebase-admin の bucket。ADC）。
import { getStorage } from "firebase-admin/storage";
import { getAdminApp } from "../firebaseAdmin";
import { extForMime, type ImageData, type ImageStore } from "./types";

export class FirebaseImageStore implements ImageStore {
  private bucket() {
    return getStorage(getAdminApp()).bucket();
  }

  async put(nodeId: string, image: ImageData): Promise<string> {
    const path = `images/${nodeId}.${extForMime(image.mime)}`;
    await this.bucket()
      .file(path)
      .save(Buffer.from(image.bytes), { contentType: image.mime, resumable: false });
    return path;
  }

  async get(path: string): Promise<ImageData | null> {
    const file = this.bucket().file(path);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [[buf], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
    return { bytes: new Uint8Array(buf), mime: meta.contentType ?? "application/octet-stream" };
  }
}
