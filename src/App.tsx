import { BrandBadge, SourceBadge, writeClipboardText } from "@taylorvance/tv-shared-web";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

import type { ComicRecord, SearchResult } from "./lib/types";

const EXCERPT_SOURCE_LABELS: Record<SearchResult["excerptSource"], string> = {
  alt: "Alt text",
  transcript: "Transcript",
  communityTranscript: "Transcript",
  title: "Title",
};

const MATCH_SOURCE_LABELS: Record<SearchResult["matchSource"], string> = {
  title: "Title match",
  alt: "Alt text match",
  transcript: "Transcript match",
  communityTranscript: "Transcript match",
  semantic: "Semantic match",
  recent: "Recent",
};

interface WorkerResponse {
  id: number;
  type: "ready" | "results" | "selected" | "status" | "error";
  count?: number;
  results?: SearchResult[];
  selected?: ComicRecord | null;
  status?: string;
  error?: string;
}

export function App() {
  const [comicCount, setComicCount] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedNum, setSelectedNum] = useState<number | null>(null);
  const [selected, setSelected] = useState<ComicRecord | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [copied, setCopied] = useState(false);
  const [refineStatus, setRefineStatus] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [resultScroll, setResultScroll] = useState({
    max: 0,
    value: 0,
    visibleRatio: 1,
  });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const worker = new Worker(new URL("./searchWorker.ts", import.meta.url), {
      type: "module",
    });

    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;

      if (message.type === "ready") {
        setComicCount(message.count ?? 0);
        return;
      }

      if (message.type === "status") {
        if (message.id === requestIdRef.current) {
          setRefineStatus(message.status ?? "");
        }
        return;
      }

      if (message.type === "results") {
        if (message.id !== 0 && message.id !== requestIdRef.current) {
          return;
        }

        setResults(message.results ?? []);
        if (message.count !== undefined) {
          setComicCount(message.count);
        }
        setRefineStatus(message.status ?? "");
        setIsSearching(false);

        const first = message.results?.[0] ?? null;
        if (first) {
          setSelectedNum((current) => current ?? first.num);
        }
        return;
      }

      if (message.type === "selected") {
        setSelected(message.selected ?? null);
        return;
      }

      if (message.type === "error") {
        console.error(message.error);
        setRefineStatus(message.error ?? "Search unavailable");
        setIsSearching(false);
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!workerRef.current) {
      return;
    }

    const id = requestIdRef.current + 1;
    requestIdRef.current = id;
    setIsSearching(Boolean(query.trim()));

    const timeoutId = window.setTimeout(() => {
      workerRef.current?.postMessage({
        id,
        type: "search",
        query,
      });
    }, 90);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  useEffect(() => {
    if (!selectedNum || !workerRef.current) {
      return;
    }

    workerRef.current.postMessage({
      id: requestIdRef.current,
      type: "select",
      num: selectedNum,
    });
  }, [selectedNum]);

  useEffect(() => {
    const syncResultScroll = () => {
      const element = resultsRef.current;

      if (!element) {
        setResultScroll({ max: 0, value: 0, visibleRatio: 1 });
        return;
      }

      const scrollWidth = element.scrollWidth;
      const clientWidth = element.clientWidth;

      setResultScroll({
        max: Math.max(0, scrollWidth - clientWidth),
        value: element.scrollLeft,
        visibleRatio: scrollWidth > 0 ? Math.min(1, clientWidth / scrollWidth) : 1,
      });
    };

    syncResultScroll();
    window.addEventListener("resize", syncResultScroll);

    return () => {
      window.removeEventListener("resize", syncResultScroll);
    };
  }, [results.length]);

  function clearQuery() {
    setQuery("");
    inputRef.current?.focus();
  }

  async function copySelectedLink() {
    if (!selected) {
      return;
    }

    const didCopy = await writeClipboardText(selected.canonicalUrl);

    if (didCopy) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }
  }

  function syncResultScroll() {
    const element = resultsRef.current;

    if (!element) {
      return;
    }

    const scrollWidth = element.scrollWidth;
    const clientWidth = element.clientWidth;

    setResultScroll({
      max: Math.max(0, scrollWidth - clientWidth),
      value: element.scrollLeft,
      visibleRatio: scrollWidth > 0 ? Math.min(1, clientWidth / scrollWidth) : 1,
    });
  }

  function setResultScrollPosition(value: number) {
    const element = resultsRef.current;

    if (!element) {
      return;
    }

    element.scrollLeft = value;
    syncResultScroll();
  }

  function resultMatchLabel(result: SearchResult): string {
    return MATCH_SOURCE_LABELS[result.matchSource] ?? EXCERPT_SOURCE_LABELS[result.excerptSource];
  }

  const searchBusy = comicCount === 0 || isSearching || refineStatus !== "";
  const searchStatus = comicCount === 0 ? "Loading index" : refineStatus || (isSearching ? "Searching" : "");
  const resultScrollbarStyle = {
    "--result-scroll-thumb-size": `${Math.max(18, resultScroll.visibleRatio * 100)}%`,
  } as CSSProperties;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="kicker">xkcd search</p>
          <h1>Relevant xkcd</h1>
        </div>
        <a className="source-link" href="https://xkcd.com/" target="_blank" rel="noreferrer">
          xkcd.com
        </a>
      </header>

      <section className="search-row" aria-label="Search comics">
        <div className="search-box">
          <input
            autoFocus
            className="search-input"
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="standards, password strength, git"
            aria-label="Search xkcd comics"
          />
          {query ? (
            <button
              aria-label="Clear search"
              className="clear-search-button"
              onClick={clearQuery}
              title="Clear search"
              type="button"
            >
              x
            </button>
          ) : null}
        </div>
        <div
          aria-atomic="true"
          aria-live="polite"
          className={`search-status ${searchBusy ? "is-active" : ""}`}
        >
          {searchStatus ? (
            <>
              <span aria-hidden="true" className="status-spinner" />
              <span>{searchStatus}</span>
            </>
          ) : null}
        </div>
        <div className="count" aria-live="polite">
          {comicCount ? `${comicCount} comics` : ""}
        </div>
      </section>

      <section className="workspace">
        <div className="results-panel">
          <div
            aria-busy={searchBusy}
            className="results"
            aria-label="Search results"
            onScroll={syncResultScroll}
            ref={resultsRef}
          >
            {results.map((result) => (
              <button
                className={`result-card ${selected?.num === result.num ? "is-selected" : ""}`}
                key={result.num}
                onClick={() => setSelectedNum(result.num)}
                type="button"
              >
                <span className="result-card-top">
                  <span className="result-meta">#{result.num}</span>
                  <span className="result-source">
                    {resultMatchLabel(result)}
                  </span>
                </span>
                <span className="result-title">{result.title}</span>
                <span className="result-excerpt">{result.excerpt}</span>
              </button>
            ))}
          </div>
          {resultScroll.max > 0 ? (
            <input
              aria-label="Scroll search results"
              className="result-scrollbar"
              max={resultScroll.max}
              min="0"
              onChange={(event) => setResultScrollPosition(Number(event.target.value))}
              style={resultScrollbarStyle}
              type="range"
              value={Math.min(resultScroll.value, resultScroll.max)}
            />
          ) : null}
        </div>

        <article className="detail" aria-label="Selected comic">
          {selected ? (
            <>
              <div className="detail-header">
                <div>
                  <p className="result-meta">#{selected.num}</p>
                  <h2>{selected.title}</h2>
                </div>
                <div className="detail-actions">
                  <button className="copy-button" onClick={copySelectedLink} type="button">
                    {copied ? "Copied" : "Copy link"}
                  </button>
                  <a className="open-link" href={selected.canonicalUrl} target="_blank" rel="noreferrer">
                    Open
                  </a>
                  {selected.sourceFlags.includes("explainxkcd") ? (
                    <a className="open-link" href={selected.explainUrl} target="_blank" rel="noreferrer">
                      Explain
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="comic-frame">
                <img src={selected.imageUrl} alt={selected.alt || selected.title} />
              </div>

              {selected.alt ? <p className="alt-text">{selected.alt}</p> : null}
            </>
          ) : (
            <p className="empty-state">Loading index</p>
          )}
        </article>
      </section>

      <footer className="attribution">
        <div className="footer-links">
          <SourceBadge
            aria-label="Open Relevant xkcd source repository on GitHub"
            className="source-badge"
            href="https://github.com/taylorvance/relevantxkcd"
            iconClassName="source-badge-icon"
            labelClassName="source-badge-label"
            unstyled
          />
          <BrandBadge
            className="brand-badge"
            iconClassName="brand-badge-icon"
            labelClassName="brand-badge-label"
            unstyled
          />
        </div>
        <span>
          Unofficial, noncommercial tool.{" "}
          <a href="https://xkcd.com/" target="_blank" rel="noreferrer">
            xkcd
          </a>{" "}
          content is by Randall Munroe and licensed under{" "}
          <a href="https://creativecommons.org/licenses/by-nc/2.5/" target="_blank" rel="noreferrer">
            CC BY-NC 2.5
          </a>
          .
        </span>{" "}
        <span>
          Search may also use{" "}
          <a href="https://www.explainxkcd.com/wiki/" target="_blank" rel="noreferrer">
            explainxkcd
          </a>{" "}
          transcript text under{" "}
          <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">
            CC BY-SA 3.0
          </a>
          , with source links on matched comics.
        </span>{" "}
        <span>
          Comic images load from xkcd image URLs. This is an independent project
          and is not affiliated with xkcd or explainxkcd.
        </span>
      </footer>
    </main>
  );
}
