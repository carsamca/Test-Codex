import { appendJson } from "./storage.js";

export async function guardarLead(payload: {
  name: string;
  contact: string;
  language?: string;
  need?: string;
  budget?: string;
  urgency?: string;
}): Promise<{ status: "ok"; file: string }> {
  const result = await appendJson("leads.jsonl", payload);
  return { status: "ok", file: result.file };
}
