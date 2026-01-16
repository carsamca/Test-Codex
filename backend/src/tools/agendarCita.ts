import { appendJson } from "./storage.js";

export async function agendarCita(payload: {
  name: string;
  contact: string;
  datetime_preference?: string;
  timezone?: string;
}): Promise<{ status: "ok"; file: string }> {
  const result = await appendJson("appointments.jsonl", payload);
  return { status: "ok", file: result.file };
}
