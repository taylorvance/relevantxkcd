import { useEffect, useMemo, useState } from "react";

import { searchComics } from "./lib/search";
import type { ComicRecord } from "./lib/types";

const RESULT_LIMIT = 24;

export function App() {
  const [records, setRecords] = useState<ComicRecord[]>([]);
  const [query, setQuery] = useState("");
  const [selectedNum, setSelectedNum] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/search-index.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Index request failed: ${response.status}`);
        }

        return response.json() as Promise<ComicRecord[]>;
      })
      .then((nextRecords) => {
        if (cancelled) {
          return;
        }

        setRecords(nextRecords);
        setSelectedNum(nextRecords.at(-1)?.num ?? null);
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const results = useMemo(() => {
    if (!query.trim()) {
      return records
        .slice()
        .sort((a, b) => b.num - a.num)
        .slice(0, RESULT_LIMIT)
        .map((record) => ({
          ...record,
          score: 0,
          excerpt: record.alt || record.transcript,
          matchedFields: [],
        }));
    }

    return searchComics(records, query, RESULT_LIMIT);
  }, [query, records]);

  const selected =
    records.find((record) => record.num === selectedNum) ??
    results[0] ??
    records.at(-1) ??
    null;

  useEffect(() => {
    if (results.length === 0) {
      return;
    }

    if (!selected || !results.some((result) => result.num === selected.num)) {
      setSelectedNum(results[0].num);
    }
  }, [results, selected]);

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
        <div className="count" aria-live="polite">
          {records.length ? `${records.length} comics` : "Loading index"}
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
        xkcd content is by Randall Munroe and licensed under CC BY-NC 2.5. Comic
        images load from xkcd image URLs.
      </footer>
    </main>
  );
}
