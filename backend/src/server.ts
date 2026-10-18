import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { detectLanguage, getLanguageConfig } from "./voice/language.js";
import { transcribeAudio } from "./voice/stt.js";
import { synthesizeSpeech } from "./voice/tts.js";
import { handleChatTurn } from "./voice/llm.js";
import { getSession, upsertSession } from "./voice/sessionStore.js";

const app = express();
const activeChatSessions = new Set<string>();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.use((req, res, next) => {
  if (req.method === "POST") {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      res.status(400).json({ error: "A JSON object is required." }); return;
    }
    for (const field of ["language", "languageHint"]) {
      if (req.body[field] !== undefined && typeof req.body[field] !== "string") {
        res.status(400).json({ error: `${field} must be a string.` }); return;
      }
    }
  }
  next();
});

app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false
  })
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/stt", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { audioBase64, text, sessionId, languageHint } = req.body as {
      audioBase64?: string;
      text?: string;
      sessionId?: string;
      languageHint?: string;
    };

    if (text !== undefined && (typeof text !== "string" || !text.trim())) {
      res.status(400).json({ error: "text must be a non-empty string." }); return;
    }
    if (audioBase64 !== undefined && typeof audioBase64 !== "string") {
      res.status(400).json({ error: "audioBase64 must be a string." }); return;
    }
    if (!text) {
      res.status(audioBase64 ? 501 : 400).json({ error: audioBase64 ? "Audio transcription is not implemented. Use explicit text mode." : "text or audioBase64 is required." }); return;
    }
    const transcript = await transcribeAudio({ audioBase64, text });
    const language = detectLanguage(transcript, languageHint);

    res.json({ text: transcript, language });
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat", async (req: Request, res: Response, next: NextFunction) => {
  let lockedSessionId: string | undefined;
  try {
    const { sessionId, text, language } = req.body as {
      sessionId: string;
      text: string;
      language?: string;
    };

    if (typeof sessionId !== "string" || !sessionId.trim() || typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "sessionId and text are required." });
      return;
    }

    if (activeChatSessions.has(sessionId)) {
      res.status(409).json({ error: "A turn is already in progress for this session." }); return;
    }
    activeChatSessions.add(sessionId);
    lockedSessionId = sessionId;
    const detectedLanguage = detectLanguage(text, language);
    const session = getSession(sessionId);
    const updatedSession = upsertSession({
      ...session,
      sessionId,
      language: detectedLanguage,
      transcript: [
        ...session.transcript,
        {
          role: "user",
          text,
          timestamp: new Date().toISOString()
        }
      ]
    });

    const { reply, actions } = await handleChatTurn({
      session: updatedSession,
      userText: text,
      language: detectedLanguage
    });

    upsertSession({
      ...updatedSession,
      transcript: [
        ...updatedSession.transcript,
        {
          role: "assistant",
          text: reply,
          timestamp: new Date().toISOString()
        }
      ]
    });

    res.json({
      reply,
      language: detectedLanguage,
      voice: getLanguageConfig(detectedLanguage).voice,
      actions
    });
  } catch (error) {
    next(error);
  } finally {
    if (lockedSessionId) activeChatSessions.delete(lockedSessionId);
  }
});

app.post("/api/tts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text, language } = req.body as {
      text: string;
      language?: string;
    };

    if (typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "text is required." });
      return;
    }

    const resolvedLanguage = detectLanguage(text, language);
    const ttsResult = await synthesizeSpeech({ text, language: resolvedLanguage });

    res.json({
      ...ttsResult,
      language: resolvedLanguage
    });
  } catch (error) {
    next(error);
  }
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[error]", error.message);
  const status = "status" in error && (error.status === 400 || error.status === 413) ? error.status : 500;
  res.status(status).json({ error: status === 500 ? "Unexpected server error." : "Invalid request body." });
});

app.listen(port, () => {
  console.log(`Voice Sales Agent API running on http://localhost:${port}`);
});
