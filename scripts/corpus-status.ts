import {
  buildManifest,
  compactMissing,
  ensureRawDirs,
  fetchCurrentXkcd,
  parseArgs,
  writeManifest,
} from "./lib/corpus.ts";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const offline = args.has("offline");

  await ensureRawDirs();

  const current = offline ? null : await fetchCurrentXkcd().catch((error) => {
    console.warn(`Upstream check failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });
  const upstream = current?.num
    ? {
        checkedAt: new Date().toISOString(),
        latestNum: Number(current.num),
        title: String(current.safe_title ?? current.title ?? ""),
      }
    : undefined;
  const manifest = await buildManifest(upstream);

  await writeManifest(manifest);

  console.log("Corpus status");
  console.log(`  xkcd:        ${manifest.xkcd.count} files, latest ${manifest.xkcd.max ?? "none"}`);
  console.log(
    `  explainxkcd: ${manifest.explainxkcd.count} files, latest ${manifest.explainxkcd.max ?? "none"}`,
  );

  if (manifest.upstream) {
    console.log(`  upstream:    ${manifest.upstream.latestNum} ${manifest.upstream.title}`);
  } else {
    console.log("  upstream:    not checked");
  }

  console.log(`  xkcd missing:        ${compactMissing(manifest.xkcd.missing)}`);
  console.log(`  explainxkcd missing: ${compactMissing(manifest.explainxkcd.missing)}`);

  if (manifest.lastRun) {
    console.log(
      `  last run:     ${manifest.lastRun.id} fetched=${manifest.lastRun.fetched} skipped=${manifest.lastRun.skipped} failed=${manifest.lastRun.failed}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
