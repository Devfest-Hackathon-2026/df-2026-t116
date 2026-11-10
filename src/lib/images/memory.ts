import { extForMime, type ImageData, type ImageStore } from "./types";

export class MemoryImageStore implements ImageStore {
  private files = new Map<string, ImageData>();

  async put(nodeId: string, image: ImageData): Promise<string> {
    const path = `images/${nodeId}.${extForMime(image.mime)}`;
    this.files.set(path, { bytes: new Uint8Array(image.bytes), mime: image.mime });
    return path;
  }

  async get(path: string): Promise<ImageData | null> {
    const f = this.files.get(path);
    return f ? { bytes: new Uint8Array(f.bytes), mime: f.mime } : null;
  }
}
