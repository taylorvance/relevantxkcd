import { useEffect, useState } from "react";
import { loadLastCheck, loadLastUpdate, relativeCheckTime, type LastCheck } from "./lib/lastChecked";

export function LastChecked() {
  const [check, setCheck] = useState<LastCheck | null>(null);
  const [update, setUpdate] = useState<LastCheck | null>(null);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      setNow(Date.now());
      void loadLastCheck().then((value) => {
        if (active) setCheck(value);
      });
      void loadLastUpdate().then((value) => {
        if (active) setUpdate(value);
      });
    };
    refresh();
    const interval = window.setInterval(refresh, 60000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  if (!check && !update) return null;
  return (
    <div className="last-checked">
      {update ? (
        <a href={update.url} title={`Last index update deployed: ${new Date(update.timestamp).toLocaleString()}`}>
          Index updated <time dateTime={update.timestamp}>{relativeCheckTime(update.timestamp, now)}</time>
        </a>
      ) : null}
      {update && check ? " · " : null}
      {check ? (
        <a href={check.url} title={`Last successful check: ${new Date(check.timestamp).toLocaleString()}`}>
          Checked <time dateTime={check.timestamp}>{relativeCheckTime(check.timestamp, now)}</time>
        </a>
      ) : null}
    </div>
  );
}
