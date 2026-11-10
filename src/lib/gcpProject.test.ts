import { afterEach, describe, expect, it, vi } from "vitest";
import { gcpProject } from "./gcpProject";

describe("gcpProject", () => {
  afterEach(() => vi.unstubAllEnvs());
  const clear = () => {
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "");
    vi.stubEnv("GCLOUD_PROJECT", "");
    vi.stubEnv("FIREBASE_CONFIG", "");
  };
  it("GOOGLE_CLOUD_PROJECT を最初に使う", () => {
    clear();
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "p1");
    vi.stubEnv("FIREBASE_CONFIG", JSON.stringify({ projectId: "p2" }));
    expect(gcpProject()).toBe("p1");
  });
  it("無ければ FIREBASE_CONFIG の projectId", () => {
    clear();
    vi.stubEnv("FIREBASE_CONFIG", JSON.stringify({ projectId: "p2" }));
    expect(gcpProject()).toBe("p2");
  });
  it("壊れた FIREBASE_CONFIG では undefined", () => {
    clear();
    vi.stubEnv("FIREBASE_CONFIG", "{oops");
    expect(gcpProject()).toBeUndefined();
  });
});
