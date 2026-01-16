import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { detectLanguage, getLanguageConfig } from "./voice/language.js";
import { transcribeAudio } from "./voice/stt.js";
import { synthesizeSpeech } from "./voice/tts.js";
import { handleChatTurn } from "./voice/llm.js";
import { getSession, upsertSession } from "./voice/sessionStore.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json({ limit: "5mb" }));

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

    const transcript = await transcribeAudio({ audioBase64, text });
    const language = detectLanguage(transcript, languageHint);

    if (sessionId) {
      const session = getSession(sessionId);
      upsertSession({
        ...session,
        sessionId,
        language,
        transcript: [
          ...session.transcript,
          {
            role: "user",
            text: transcript,
            timestamp: new Date().toISOString()
          }
        ]
      });
    }

    res.json({ text: transcript, language });
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId, text, language } = req.body as {
      sessionId: string;
      text: string;
      language?: string;
    };

    if (!sessionId || !text) {
      res.status(400).json({ error: "sessionId and text are required." });
      return;
    }

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
  }
});

app.post("/api/tts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text, language } = req.body as {
      text: string;
      language?: string;
    };

    if (!text) {
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
  res.status(500).json({
    error: "Unexpected server error.",
    message: error.message
  });
});

app.listen(port, () => {
  console.log(`Voice Sales Agent API running on http://localhost:${port}`);
});
