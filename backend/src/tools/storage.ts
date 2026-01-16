import { promises as fs } from "fs";
import path from "path";

const dataDir = path.resolve("data");

export async function appendJson(fileName: string, payload: unknown): Promise<{ file: string }> {
  await fs.mkdir(dataDir, { recursive: true });
  const filePath = path.join(dataDir, fileName);
  const line = JSON.stringify({ timestamp: new Date().toISOString(), payload });
  await fs.appendFile(filePath, `${line}\n`, "utf8");
  return { file: filePath };
}
