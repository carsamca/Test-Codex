export type TranscriptEntry = {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
};

export type SessionData = {
  sessionId: string;
  language: "es" | "en" | "fr" | "pt";
  transcript: TranscriptEntry[];
  lastActiveAt: string;
};

const sessions = new Map<string, SessionData>();

export function getSession(sessionId: string): SessionData {
  return (
    sessions.get(sessionId) ?? {
      sessionId,
      language: "en",
      transcript: [],
      lastActiveAt: new Date().toISOString()
    }
  );
}

export function upsertSession(session: SessionData): SessionData {
  const updated: SessionData = {
    ...session,
    lastActiveAt: new Date().toISOString()
  };
  sessions.set(updated.sessionId, updated);
  return updated;
}
