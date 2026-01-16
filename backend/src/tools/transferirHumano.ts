import { appendJson } from "./storage.js";

export async function transferirHumano(payload: {
  reason: string;
}): Promise<{ status: "ok"; file: string }> {
  const result = await appendJson("handoffs.jsonl", payload);
  return { status: "ok", file: result.file };
}
