import { getLanguageConfig, SupportedLanguage } from "./language.js";

export type TTSRequest = {
  text: string;
  language: SupportedLanguage;
};

export type TTSResponse = {
  audioBase64: string | null;
  provider: "openai" | "browser" | "stub";
  warning?: string;
};

export async function synthesizeSpeech({ text, language }: TTSRequest): Promise<TTSResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      audioBase64: null,
      provider: "stub",
      warning: "OPENAI_API_KEY not set. Use browser speechSynthesis as fallback."
    };
  }

  const { voice } = getLanguageConfig(language);
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      format: "mp3"
    })
  });

  if (!response.ok) {
    throw new Error(`TTS error: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    audioBase64: buffer.toString("base64"),
    provider: "openai"
  };
}
