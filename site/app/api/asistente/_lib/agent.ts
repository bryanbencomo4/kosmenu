/**
 * Thin discovery tool loop.
 * Live Gemini only when isDiscoveryGeminiLiveAllowed — never in prod without persistent quota.
 * Simulate / fallback path never hits Google.
 */

import type { DiscoveryAssistantConfig } from './config';
import {
  DISCOVERY_FALLBACK_MSG,
  isDiscoveryGeminiLiveAllowed,
} from './config';
import { buildDiscoverySystemPrompt } from './prompt';
import { runSimulatedDiscoveryAgent } from './simulate';
import { extractDiscoveryGeminiUsage } from './gemini-usage';
import {
  DISCOVERY_TOOL_DECLARATIONS,
  executeDiscoveryTool,
  type DiscoveryRestaurantCard,
  type DiscoveryToolContext,
} from './tools';

export { extractDiscoveryGeminiUsage } from './gemini-usage';

export type DiscoveryAgentMessage = { role: 'user' | 'assistant'; text: string };

export type DiscoveryAgentResult = {
  text: string;
  model: string;
  restaurants: DiscoveryRestaurantCard[];
  toolCalls: number;
  fallback?: boolean;
  skippedLlm?: boolean;
  /** Sum of usageMetadata across all Gemini HTTP rounds in this turn. */
  tokensInput?: number;
  tokensOutput?: number;
  geminiHttpCalls?: number;
};

type GeminiPart = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
};

type GeminiContent = { role: string; parts: GeminiPart[] };

type GeminiResponseJson = {
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
};

async function callDiscoveryGemini(params: {
  apiKey: string;
  model: string;
  body: Record<string, unknown>;
  timeoutMs: number;
}): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params.body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function toContents(messages: DiscoveryAgentMessage[]): GeminiContent[] {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }));
}

async function runLiveDiscoveryGemini(params: {
  config: DiscoveryAssistantConfig;
  messages: DiscoveryAgentMessage[];
  ctx: DiscoveryToolContext;
}): Promise<DiscoveryAgentResult> {
  const { config, messages, ctx } = params;
  const apiKey = config.geminiApiKey!;
  const tools = [
    {
      functionDeclarations: DISCOVERY_TOOL_DECLARATIONS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];

  const contents = toContents(messages);
  const restaurants: DiscoveryRestaurantCard[] = [];
  let toolCalls = 0;
  let modelUsed = config.model;
  let tokensInput = 0;
  let tokensOutput = 0;
  let geminiHttpCalls = 0;

  const withUsage = (
    result: Omit<DiscoveryAgentResult, 'tokensInput' | 'tokensOutput' | 'geminiHttpCalls'>,
  ): DiscoveryAgentResult => ({
    ...result,
    tokensInput,
    tokensOutput,
    geminiHttpCalls,
  });

  for (let round = 0; round <= config.maxToolRounds; round++) {
    const body = {
      systemInstruction: { parts: [{ text: buildDiscoverySystemPrompt() }] },
      contents,
      tools,
      generationConfig: {
        maxOutputTokens: config.maxOutputTokens,
        temperature: 0.4,
      },
    };

    let res: Response;
    try {
      res = await callDiscoveryGemini({
        apiKey,
        model: modelUsed,
        body,
        timeoutMs: config.timeoutMs,
      });
    } catch {
      if (modelUsed !== config.modelFallback) {
        modelUsed = config.modelFallback;
        continue;
      }
      // Partial usage (prior successful rounds) still returned to the caller.
      return withUsage({
        text: DISCOVERY_FALLBACK_MSG,
        model: modelUsed,
        restaurants,
        toolCalls,
        fallback: true,
      });
    }

    if (!res.ok) {
      if (modelUsed !== config.modelFallback) {
        modelUsed = config.modelFallback;
        continue;
      }
      return withUsage({
        text: DISCOVERY_FALLBACK_MSG,
        model: modelUsed,
        restaurants,
        toolCalls,
        fallback: true,
      });
    }

    geminiHttpCalls += 1;
    const json = (await res.json()) as GeminiResponseJson;
    const usage = extractDiscoveryGeminiUsage(json);
    tokensInput += usage.in;
    tokensOutput += usage.out;

    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    const fnCalls = parts.filter((p) => p.functionCall?.name);

    if (fnCalls.length === 0) {
      const text = parts
        .map((p) => p.text || '')
        .filter(Boolean)
        .join('\n')
        .trim();
      return withUsage({
        text: text || DISCOVERY_FALLBACK_MSG,
        model: modelUsed,
        restaurants,
        toolCalls,
      });
    }

    contents.push({ role: 'model', parts });
    const responseParts: GeminiPart[] = [];
    for (const part of fnCalls) {
      const name = part.functionCall!.name;
      const args = (part.functionCall!.args ?? {}) as Record<string, unknown>;
      toolCalls += 1;
      const result = await executeDiscoveryTool(name, args, ctx);
      if (result.restaurants?.length) {
        for (const r of result.restaurants) {
          if (!restaurants.some((x) => x.id === r.id)) restaurants.push(r);
        }
      }
      responseParts.push({
        functionResponse: { name, response: result },
      });
    }
    contents.push({ role: 'user', parts: responseParts });
  }

  return withUsage({
    text: DISCOVERY_FALLBACK_MSG,
    model: modelUsed,
    restaurants,
    toolCalls,
    fallback: true,
  });
}

/**
 * Run discovery agent: simulate → live Gemini (if allowed) → soft fallback.
 */
export async function runDiscoveryAgent(params: {
  config: DiscoveryAssistantConfig;
  messages: DiscoveryAgentMessage[];
  ctx: DiscoveryToolContext;
  env?: NodeJS.ProcessEnv;
}): Promise<DiscoveryAgentResult> {
  const env = params.env ?? process.env;
  const { config, messages, ctx } = params;

  if (config.simulate || !isDiscoveryGeminiLiveAllowed(config, env).ok) {
    try {
      if (config.simulate) {
        const sim = await runSimulatedDiscoveryAgent({ messages, ctx });
        return {
          text: sim.text,
          model: sim.model,
          restaurants: sim.restaurants,
          toolCalls: sim.toolCalls,
          skippedLlm: true,
          tokensInput: 0,
          tokensOutput: 0,
          geminiHttpCalls: 0,
        };
      }
      // Gemini not live — still run deterministic tool path for last user text.
      const sim = await runSimulatedDiscoveryAgent({ messages, ctx });
      return {
        text: sim.text,
        model: 'directory-fallback',
        restaurants: sim.restaurants,
        toolCalls: sim.toolCalls,
        fallback: true,
        skippedLlm: true,
        tokensInput: 0,
        tokensOutput: 0,
        geminiHttpCalls: 0,
      };
    } catch {
      return {
        text: DISCOVERY_FALLBACK_MSG,
        model: 'fallback',
        restaurants: [],
        toolCalls: 0,
        fallback: true,
        skippedLlm: true,
        tokensInput: 0,
        tokensOutput: 0,
        geminiHttpCalls: 0,
      };
    }
  }

  try {
    return await runLiveDiscoveryGemini({ config, messages, ctx });
  } catch (err) {
    // Soft degrade: directory path still available to the client.
    // Preserve any partial usage attached by a failed live attempt when present.
    const partialIn =
      err && typeof err === 'object' && 'tokensInput' in err
        ? Number((err as { tokensInput?: number }).tokensInput || 0)
        : 0;
    const partialOut =
      err && typeof err === 'object' && 'tokensOutput' in err
        ? Number((err as { tokensOutput?: number }).tokensOutput || 0)
        : 0;
    try {
      const sim = await runSimulatedDiscoveryAgent({ messages, ctx });
      return {
        text: sim.text || DISCOVERY_FALLBACK_MSG,
        model: 'directory-fallback',
        restaurants: sim.restaurants,
        toolCalls: sim.toolCalls,
        fallback: true,
        skippedLlm: true,
        tokensInput: partialIn,
        tokensOutput: partialOut,
        geminiHttpCalls: 0,
      };
    } catch {
      return {
        text: DISCOVERY_FALLBACK_MSG,
        model: 'fallback',
        restaurants: [],
        toolCalls: 0,
        fallback: true,
        tokensInput: partialIn,
        tokensOutput: partialOut,
        geminiHttpCalls: 0,
      };
    }
  }
}
