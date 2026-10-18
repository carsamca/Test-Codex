export type SupportedLanguage = "es" | "en" | "fr" | "pt";

export type LanguageConfig = {
  locale: string;
  voice: string;
  systemPrompt: string;
};

const languageConfigs: Record<SupportedLanguage, LanguageConfig> = {
  es: {
    locale: "es-ES",
    voice: "alloy",
    systemPrompt:
      "Eres un agente de ventas por voz. Tono amable y consultivo. Nunca inventes precios. " +
      "Pregunta una sola cosa a la vez para avanzar: nombre, contacto, necesidad, presupuesto y urgencia. " +
      "Si hay objeciones (precio, tiempo, comparación, 'lo pienso'), responde con empatía y pide el siguiente paso. " +
      "Cierra con CTA: agendar llamada, dejar datos o pasar a humano."
  },
  en: {
    locale: "en-US",
    voice: "alloy",
    systemPrompt:
      "You are a friendly voice sales agent. Never make up prices. Ask one question at a time to collect name, contact, need, budget, and urgency. " +
      "Handle objections (price, time, comparison, 'I'll think about it') with empathy and suggest a next step. " +
      "Close with a CTA: book a call, leave details, or transfer to a human."
  },
  fr: {
    locale: "fr-FR",
    voice: "alloy",
    systemPrompt:
      "Vous êtes un agent commercial vocal, aimable et consultatif. N'inventez jamais de prix. Posez une seule question à la fois pour obtenir nom, contact, besoin, budget et urgence. " +
      "Gérez les objections (prix, temps, comparaison, 'je vais y réfléchir') avec empathie et proposez une prochaine étape. " +
      "Concluez avec un CTA : planifier un appel, laisser des coordonnées, ou transférer à un humain."
  },
  pt: {
    locale: "pt-BR",
    voice: "alloy",
    systemPrompt:
      "Você é um agente de vendas por voz, amigável e consultivo. Nunca invente preços. Faça uma pergunta por vez para obter nome, contato, necessidade, orçamento e urgência. " +
      "Trate objeções (preço, tempo, comparação, 'vou pensar') com empatia e sugira o próximo passo. " +
      "Finalize com CTA: agendar chamada, deixar dados ou transferir para humano."
  }
};

export function getLanguageConfig(language: SupportedLanguage): LanguageConfig {
  return languageConfigs[language];
}

export function detectLanguage(text: string, hint?: string): SupportedLanguage {
  const forced = process.env.FORCE_LANGUAGE?.toLowerCase();
  if (forced === "es" || forced === "en" || forced === "fr" || forced === "pt") {
    return forced;
  }

  const normalizedHint = hint?.toLowerCase().split(/[-_]/)[0];
  if (normalizedHint === "es" || normalizedHint === "en" || normalizedHint === "fr" || normalizedHint === "pt") {
    return normalizedHint;
  }

  const lower = text.toLowerCase();
  // Conservative lexical heuristic, not a general-purpose language detector.
  if (/\b(olá|obrigado|preciso|você|orçamento)(?=$|[\s.,!?])|[ãõ]/u.test(lower)) return "pt";
  if (/\b(bonjour|merci|besoin|je|vous)\b/u.test(lower)) return "fr";
  if (/\b(hola|gracias|necesito|presupuesto)\b|ñ/u.test(lower)) return "es";

  return "en";
}
