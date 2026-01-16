export type STTInput = {
  audioBase64?: string;
  text?: string;
};

export async function transcribeAudio(input: STTInput): Promise<string> {
  if (input.text && input.text.trim().length > 0) {
    return input.text.trim();
  }

  if (!input.audioBase64) {
    return "";
  }

  // TODO: Implement audio transcription (e.g., OpenAI Whisper API)
  // This stub avoids storing raw audio by default.
  return "";
}
