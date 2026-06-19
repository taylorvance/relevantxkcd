import { useEffect, useRef, useState } from "react";

import type { ComicRecord, SearchResult } from "./lib/types";

const RESULT_LIMIT = 24;

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
  const [semanticEnabled, setSemanticEnabled] = useState(false);
  const [semanticStatus, setSemanticStatus] = useState("");
  const [isSearching, setIsSearching] = useState(false);
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
          setSemanticStatus(message.status ?? "");
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
        setSemanticStatus(message.status ?? "");
        setIsSearching(false);

        const first = message.results?.[0] ?? null;
        if (first) {
          setSelectedNum((current) =>
            current && message.results?.some((result) => result.num === current)
              ? current
              : first.num,
          );
        }
        return;
      }

      if (message.type === "selected") {
        setSelected(message.selected ?? null);
        return;
      }

      if (message.type === "error") {
        console.error(message.error);
        setSemanticStatus(message.error ?? "Search unavailable");
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
        semanticEnabled,
      });
    }, 90);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query, semanticEnabled]);

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

  async function copySelectedLink() {
    if (!selected) {
      return;
    }

    await navigator.clipboard.writeText(selected.canonicalUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

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
        <input
          autoFocus
          className="search-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="standards, password strength, git"
          aria-label="Search xkcd comics"
        />
        <label className="semantic-toggle">
          <input
            checked={semanticEnabled}
            onChange={(event) => setSemanticEnabled(event.target.checked)}
            type="checkbox"
          />
          <span>Semantic</span>
        </label>
        <div className="count" aria-live="polite">
          {semanticStatus ||
            (isSearching ? "Searching" : comicCount ? `${comicCount} comics` : "Loading index")}
        </div>
      </section>

      <section className="workspace">
        <div className="results" aria-label="Search results">
          {results.map((result) => (
            <button
              className={`result-card ${selected?.num === result.num ? "is-selected" : ""}`}
              key={result.num}
              onClick={() => setSelectedNum(result.num)}
              type="button"
            >
              <span className="result-meta">#{result.num}</span>
              <span className="result-title">{result.title}</span>
              <span className="result-excerpt">{result.excerpt}</span>
            </button>
          ))}
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
        xkcd content is by Randall Munroe and licensed under CC BY-NC 2.5.
        Search may also use explainxkcd text, licensed under CC BY-SA 3.0, with
        source links on matched comics. Comic images load from xkcd image URLs.
      </footer>
    </main>
  );
}
