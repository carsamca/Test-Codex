import { getLanguageConfig, SupportedLanguage } from "./language.js";
import { SessionData } from "./sessionStore.js";
import { agendarCita } from "../tools/agendarCita.js";
import { buscarFAQ } from "../tools/buscarFAQ.js";
import { guardarLead } from "../tools/guardarLead.js";
import { transferirHumano } from "../tools/transferirHumano.js";

const OPENAI_URL = "https://api.openai.com/v1/responses";

export type ChatResult = {
  reply: string;
  actions: Array<{ tool: string; payload: unknown }>;
};

type ChatTurnInput = {
  session: SessionData;
  userText: string;
  language: SupportedLanguage;
};

function parseToolArguments(value: unknown): Record<string, string> {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid tool arguments");
  const args: Record<string, string> = {};
  for (const [key, item] of Object.entries(parsed)) {
    if (typeof item !== "string") throw new Error(`Invalid tool field: ${key}`);
    args[key] = item;
  }
  return args;
}

function required(args: Record<string, string>, key: string): string {
  if (!args[key]?.trim()) throw new Error(`Missing tool field: ${key}`);
  return args[key];
}

async function dispatchTool(name: string, value: unknown): Promise<unknown> {
  const args = parseToolArguments(value);
  switch (name) {
    case "guardarLead": return guardarLead({ ...args, name: required(args, "name"), contact: required(args, "contact") });
    case "agendarCita": return agendarCita({ ...args, name: required(args, "name"), contact: required(args, "contact") });
    case "transferirHumano": return transferirHumano({ reason: required(args, "reason") });
    case "buscarFAQ": return buscarFAQ({ query: required(args, "query"), language: args.language });
    default: throw new Error("Unknown tool");
  }
}

export async function handleChatTurn({ session, userText, language }: ChatTurnInput): Promise<ChatResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const { systemPrompt } = getLanguageConfig(language);

  if (!apiKey) {
    return {
      reply: getFallbackReply(language, userText),
      actions: []
    };
  }

  const messages = [
    {
      role: "system",
      content: systemPrompt
    },
    ...session.transcript.map((entry) => ({
      role: entry.role,
      content: entry.text
    }))
  ];

  const response = await fetchWithRetry(
    OPENAI_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: messages,
        tools: [
          {
            type: "function",
            name: "guardarLead",
            description: "Guardar lead de ventas",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string" },
                contact: { type: "string" },
                language: { type: "string" },
                need: { type: "string" },
                budget: { type: "string" },
                urgency: { type: "string" }
              },
              required: ["name", "contact"]
            }
          },
          {
            type: "function",
            name: "agendarCita",
            description: "Agendar llamada",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string" },
                contact: { type: "string" },
                datetime_preference: { type: "string" },
                timezone: { type: "string" }
              },
              required: ["name", "contact"]
            }
          },
          {
            type: "function",
            name: "transferirHumano",
            description: "Transferir a un humano",
            parameters: {
              type: "object",
              properties: {
                reason: { type: "string" }
              },
              required: ["reason"]
            }
          },
          {
            type: "function",
            name: "buscarFAQ",
            description: "Buscar respuestas FAQ",
            parameters: {
              type: "object",
              properties: {
                query: { type: "string" },
                language: { type: "string" }
              },
              required: ["query"]
            }
          }
        ],
        tool_choice: "auto",
        temperature: 0.4
      })
    },
    2
  );

  if (!response.ok) throw new Error(`LLM error: ${response.status}`);
  const payload = (await response.json()) as OpenAIResponse;
  const reply = extractAssistantReply(payload) ?? getFallbackReply(language, userText);
  const actions = await runTools(payload);

  return { reply, actions };
}

function getFallbackReply(language: SupportedLanguage, userText: string): string {
  const prompts: Record<SupportedLanguage, string> = {
    es: "Gracias por tu mensaje. ¿Cuál es tu nombre?",
    en: "Thanks for sharing. What is your name?",
    fr: "Merci pour votre message. Quel est votre nom ?",
    pt: "Obrigado pela mensagem. Qual é o seu nome?"
  };

  return prompts[language] ?? userText;
}

type OpenAIResponse = {
  output?: Array<{
    type: string;
    content?: Array<{ type: string; text?: string }>;
    name?: string;
    arguments?: unknown;
  }>;
};

function extractAssistantReply(payload: OpenAIResponse): string | null {
  const output = payload.output ?? [];
  for (const item of output) {
    if (item.type === "message") {
      const text = item.content?.find((part) => part.type === "output_text")?.text;
      if (text) {
        return text;
      }
    }
  }
  return null;
}

async function runTools(payload: OpenAIResponse): Promise<Array<{ tool: string; payload: unknown }>> {
  const output = payload.output ?? [];
  const actions: Array<{ tool: string; payload: unknown }> = [];

  for (const item of output) {
    if (item.type === "function_call" && item.name && item.arguments) {
      const result = await dispatchTool(item.name, item.arguments);
      actions.push({ tool: item.name, payload: result });
    }
  }

  return actions;
}

async function fetchWithRetry(url: string, init: RequestInit, retries: number): Promise<Response> {
  let attempt = 0;
  while (attempt <= retries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok || attempt === retries) {
        return response;
      }
    } catch (error) {
      clearTimeout(timeout);
      if (attempt === retries) {
        throw error;
      }
    }

    attempt += 1;
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }

  throw new Error("Failed to reach LLM after retries.");
}
