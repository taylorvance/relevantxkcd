import { createProjectStorage } from "@taylorvance/tv-shared-web/storage";

const API_ROOT = "https://api.github.com/repos/taylorvance/relevantxkcd/actions";
const storage = createProjectStorage("relevantxkcd", { version: 1 });
const CACHE_KEYS = { check: "last-checked", update: "last-updated" } as const;
type StatusKind = keyof typeof CACHE_KEYS;
const CACHE_MS = 15 * 60 * 1000;

export interface LastCheck {
  timestamp: string;
  url: string;
}

interface WorkflowJobs {
  jobs: {
    steps: {
      name: string;
      conclusion: string | null;
      completed_at: string | null;
    }[];
  }[];
}

async function request(path: string) {
  const response = await fetch(`${API_ROOT}/${path}`, {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error("Workflow status unavailable");
  return response.json();
}

async function fetchLastCheck(): Promise<LastCheck | null> {
  const data: { workflow_runs: { id: number }[] } = await request(
    "workflows/update-index.yml/runs?status=completed&per_page=3",
  );
  for (const run of data.workflow_runs) {
    const data: WorkflowJobs = await request(`runs/${run.id}/jobs`);
    for (const job of data.jobs) {
      const refresh = job.steps.find((step) => step.name === "Refresh public search index");
      const outcome = job.steps.find((step) => step.name === "Classify update outcome");
      if (
        refresh?.conclusion === "success" &&
        outcome?.conclusion === "success" &&
        refresh.completed_at &&
        Number.isFinite(Date.parse(refresh.completed_at))
      ) {
        return {
          timestamp: refresh.completed_at,
          url: `https://github.com/taylorvance/relevantxkcd/actions/runs/${run.id}`,
        };
      }
    }
  }
  return null;
}

async function fetchLastUpdate(): Promise<LastCheck | null> {
  const data: { workflow_runs: { id: number }[] } = await request(
    "workflows/update-index.yml/runs?status=success&per_page=3",
  );
  for (const run of data.workflow_runs) {
    const data: WorkflowJobs = await request(`runs/${run.id}/jobs`);
    const deployment = data.jobs.flatMap((job) => job.steps).find(
      (step) => step.name === "Deploy to GitHub Pages" && step.conclusion === "success",
    );
    if (deployment?.completed_at && Number.isFinite(Date.parse(deployment.completed_at))) {
      return {
        timestamp: deployment.completed_at,
        url: `https://github.com/taylorvance/relevantxkcd/actions/runs/${run.id}`,
      };
    }
  }
  return null;
}

const pending: Partial<Record<StatusKind, Promise<LastCheck | null>>> = {};

function readCache(kind: StatusKind): { savedAt: number; value: LastCheck | null } | null {
  const cached = storage.readJson<unknown>(CACHE_KEYS[kind]);
  if (
    typeof cached !== "object" || cached === null ||
    !("savedAt" in cached) || typeof cached.savedAt !== "number" ||
    !Number.isFinite(cached.savedAt) || cached.savedAt > Date.now() ||
    !("value" in cached)
  ) {
    return null;
  }
  const value = cached.value;
  if (value === null) return { savedAt: cached.savedAt, value };
  if (
    typeof value !== "object" ||
    !("timestamp" in value) || typeof value.timestamp !== "string" ||
    !Number.isFinite(Date.parse(value.timestamp)) ||
    !("url" in value) || typeof value.url !== "string" ||
    !/^https:\/\/github\.com\/taylorvance\/relevantxkcd\/actions\/runs\/\d+$/.test(value.url)
  ) {
    return null;
  }
  return { savedAt: cached.savedAt, value: { timestamp: value.timestamp, url: value.url } };
}

export function loadLastCheck(): Promise<LastCheck | null> {
  return loadStatus("check");
}

export function loadLastUpdate(): Promise<LastCheck | null> {
  return loadStatus("update");
}

function loadStatus(kind: StatusKind): Promise<LastCheck | null> {
  const existing = pending[kind];
  if (existing) return existing;
  const promise = (async () => {
    const cached = readCache(kind);
    if (cached && Date.now() - cached.savedAt < CACHE_MS) return cached.value;

    const value = await (kind === "check" ? fetchLastCheck() : fetchLastUpdate()).catch(() => null);
    storage.writeJson({ savedAt: Date.now(), value }, CACHE_KEYS[kind]);
    return value;
  })().finally(() => {
    delete pending[kind];
  });
  pending[kind] = promise;
  return promise;
}

export function relativeCheckTime(timestamp: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(timestamp)) / 60000));
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (minutes < 1) return "just now";
  if (minutes < 60) return formatter.format(-minutes, "minute");
  if (minutes < 1440) return formatter.format(-Math.floor(minutes / 60), "hour");
  return formatter.format(-Math.floor(minutes / 1440), "day");
}
