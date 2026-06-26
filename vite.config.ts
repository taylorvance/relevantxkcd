import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const repoName = env.GITHUB_REPOSITORY?.split("/")[1];
  const base =
    env.VITE_BASE_PATH ??
    (env.GITHUB_ACTIONS === "true" && repoName ? `/${repoName}/` : "/");

  return {
    base,
    plugins: [react()],
    server: {
      allowedHosts: ["tvmini"],
    },
    worker: {
      format: "es",
    },
  };
});
