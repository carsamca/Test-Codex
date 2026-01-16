import { appendJson } from "./storage.js";

const FAQS = [
  {
    q: "pricing",
    a: "We tailor proposals after understanding your needs. Can you share your main goal?"
  },
  {
    q: "implementation",
    a: "Typical onboarding takes a few days once scope is defined. What's your timeline?"
  }
];

export async function buscarFAQ(payload: {
  query: string;
  language?: string;
}): Promise<{ answer: string; file: string }> {
  const hit = FAQS.find((faq) => payload.query.toLowerCase().includes(faq.q));
  const answer = hit?.a ?? "Thanks for the question. Let me check and get back to you.";
  const result = await appendJson("faq_queries.jsonl", payload);
  return { answer, file: result.file };
}
