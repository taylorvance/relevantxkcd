import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadLastCheck, loadLastUpdate } from "./lastChecked";

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: vi.fn() } });
});

afterEach(() => vi.unstubAllGlobals());

const check = {
  timestamp: "2026-10-21T12:00:00Z",
  url: "https://github.com/taylorvance/relevantxkcd/actions/runs/123",
};

it("reuses a fresh shared cache without requesting GitHub", async () => {
  const getItem = vi.fn(() => JSON.stringify({ savedAt: Date.now(), value: check }));
  vi.stubGlobal("window", { localStorage: { getItem } });
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  expect(await loadLastCheck()).toEqual(check);
  expect(getItem).toHaveBeenCalledWith("relevantxkcd:v1:last-checked");
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([
  "not json",
  JSON.stringify({ savedAt: Date.now(), value: {} }),
  JSON.stringify({ savedAt: Date.now(), value: { ...check, timestamp: "invalid" } }),
  JSON.stringify({ savedAt: Date.now(), value: { ...check, url: "javascript:alert(1)" } }),
  JSON.stringify({ savedAt: Date.now() + 3600000, value: check }),
  JSON.stringify({ savedAt: Date.now() - 15 * 60000, value: check }),
])("ignores malformed or expired cache: %s", async (cached) => {
  vi.stubGlobal("window", { localStorage: { getItem: () => cached, setItem: vi.fn() } });
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ workflow_runs: [] }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await loadLastCheck()).toBeNull();
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("uses a successful fetch even when the run is cancelled", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({ workflow_runs: [{ id: 123, conclusion: "cancelled" }] }))
    .mockResolvedValueOnce(Response.json({ jobs: [{ steps: [
      { name: "Refresh public search index", conclusion: "success", completed_at: "2026-10-21T12:00:00Z" },
      { name: "Classify update outcome", conclusion: "success" },
    ] }] }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await loadLastCheck()).toEqual({
    timestamp: "2026-10-21T12:00:00Z",
    url: "https://github.com/taylorvance/relevantxkcd/actions/runs/123",
  });
});

it("does not report a fetch whose outcome classification failed", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(Response.json({ workflow_runs: [{ id: 123 }] }))
    .mockResolvedValueOnce(Response.json({ jobs: [{ steps: [
      { name: "Refresh public search index", conclusion: "success", completed_at: "2026-10-21T12:00:00Z" },
      { name: "Classify update outcome", conclusion: "failure" },
    ] }] })));
  expect(await loadLastCheck()).toBeNull();
});

it("hides status when GitHub rate limits the request", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
  expect(await loadLastCheck()).toBeNull();
});

it("finds a deployed update past a successful manual no-change run", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({ workflow_runs: [{ id: 124 }, { id: 123 }] }))
    .mockResolvedValueOnce(Response.json({ jobs: [{ steps: [] }] }))
    .mockResolvedValueOnce(Response.json({ jobs: [{ steps: [
      { name: "Deploy to GitHub Pages", conclusion: "success", completed_at: check.timestamp },
    ] }] }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await loadLastUpdate()).toEqual(check);
  expect(fetchMock.mock.calls[0][0]).toContain("status=success");
});

it("does not count a failed deployment as an index update", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(Response.json({ workflow_runs: [{ id: 123 }] }))
    .mockResolvedValueOnce(Response.json({ jobs: [{ steps: [
      { name: "Deploy to GitHub Pages", conclusion: "failure", completed_at: check.timestamp },
    ] }] })));
  expect(await loadLastUpdate()).toBeNull();
});

it("keeps update and check cache entries separate", async () => {
  const getItem = vi.fn((key: string) => key.endsWith(":last-checked")
    ? JSON.stringify({ savedAt: Date.now(), value: check })
    : null);
  const setItem = vi.fn();
  vi.stubGlobal("window", { localStorage: { getItem, setItem } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ workflow_runs: [] })));
  expect(await loadLastCheck()).toEqual(check);
  expect(await loadLastUpdate()).toBeNull();
  expect(setItem).toHaveBeenCalledWith("relevantxkcd:v1:last-updated", expect.any(String));
});
