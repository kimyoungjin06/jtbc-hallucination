import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

import { getRuntimeProviderKeyStatuses } from "./model-routing.mjs";

const clients = new Map();

function getProviderApiKey(providerId) {
  switch (providerId) {
    case "openai":
      return process.env.OPENAI_API_KEY ?? "";
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY ?? "";
    case "google":
      return process.env.GOOGLE_API_KEY ?? "";
    default:
      return "";
  }
}

export function getProviderRuntimeSupport() {
  return getRuntimeProviderKeyStatuses().map((provider) => ({
    ...provider,
    sdkReady: true
  }));
}

export function getProviderClient(providerId) {
  if (clients.has(providerId)) {
    return clients.get(providerId);
  }

  const apiKey = getProviderApiKey(providerId);
  if (!apiKey) {
    return null;
  }

  let client = null;

  switch (providerId) {
    case "openai":
      client = new OpenAI({ apiKey });
      break;
    case "anthropic":
      client = new Anthropic({ apiKey });
      break;
    case "google":
      client = new GoogleGenAI({ apiKey });
      break;
    default:
      client = null;
  }

  if (client) {
    clients.set(providerId, client);
  }

  return client;
}
