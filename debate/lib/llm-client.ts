/**
 * Shared LLM client utilities for Anthropic, OpenAI, and Google Gemini.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

export type Provider = "anthropic" | "openai" | "google";

export interface LLMResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

/* ── Anthropic ── */

function getAnthropicClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey: key });
}

async function callAnthropic(
  model: string, system: string, user: string
): Promise<LLMResult> {
  const client = getAnthropicClient();
  const res = await client.messages.create({
    model,
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: user }],
  });
  const content = res.content[0].type === "text" ? res.content[0].text : "";
  return { content, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
}

/* ── OpenAI ── */

function getOpenAIClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  return new OpenAI({ apiKey: key });
}

async function callOpenAI(
  model: string, system: string, user: string
): Promise<LLMResult> {
  const client = getOpenAIClient();
  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  const useNewTokenParam = model.startsWith("gpt-5") || model.startsWith("o");
  const res = await client.chat.completions.create({
    model,
    messages,
    ...(useNewTokenParam ? { max_completion_tokens: 2048 } : { max_tokens: 2048 }),
  });
  const content = res.choices[0]?.message?.content ?? "";
  return {
    content,
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
  };
}

/* ── Google Gemini ── */

function getGeminiClient() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  return new GoogleGenAI({ apiKey: key });
}

async function callGemini(
  model: string, system: string, user: string
): Promise<LLMResult> {
  const client = getGeminiClient();
  const res = await client.models.generateContent({
    model,
    contents: user,
    config: {
      systemInstruction: system,
      maxOutputTokens: 2048,
    },
  });
  const content = res.text ?? "";
  const inputTokens = res.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = res.usageMetadata?.candidatesTokenCount ?? 0;
  return { content, inputTokens, outputTokens };
}

/* ── Unified callModel ── */

export async function callModel(
  provider: Provider,
  model: string,
  system: string,
  user: string
): Promise<LLMResult> {
  if (provider === "anthropic") return callAnthropic(model, system, user);
  if (provider === "google") return callGemini(model, system, user);
  return callOpenAI(model, system, user);
}
