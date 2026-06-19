import type { SemanticIndexFile } from "./semantic";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

let extractorPromise: Promise<unknown> | null = null;

export async function embedQuery(query: string): Promise<Float32Array> {
  const extractor = await getExtractor();
  const output = await extractor(query, {
    pooling: "mean",
    normalize: true,
  });

  return output.data;
}

export async function loadSemanticIndex(): Promise<SemanticIndexFile> {
  const response = await fetch("/semantic-index.json");

  if (!response.ok) {
    throw new Error(`Semantic index request failed: ${response.status}`);
  }

  return response.json() as Promise<SemanticIndexFile>;
}

async function getExtractor(): Promise<{
  (input: string, options: { pooling: "mean"; normalize: true }): Promise<{
    data: Float32Array;
  }>;
}> {
  extractorPromise ??= import("@huggingface/transformers").then(
    async ({ env, pipeline }) => {
      env.allowLocalModels = false;
      return pipeline("feature-extraction", MODEL_ID, { dtype: "q8" });
    },
  );

  return extractorPromise as ReturnType<typeof getExtractor>;
}
