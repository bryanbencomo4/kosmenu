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
import {
  DISCOVERY_TOOL_DECLARATIONS,
  executeDiscoveryTool,
  type DiscoveryRestaurantCard,
  type DiscoveryToolContext,
} from './tools';

export type DiscoveryAgentMessage = { role: 'user' | 'assistant'; text: string };

export type DiscoveryAgentResult = {
  text: string;
  model: string;
  restaurants: DiscoveryRestaurantCard[];
  toolCalls: number;
  fallback?: boolean;
  skippedLlm?: boolean;
};

type GeminiPart = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
};

type GeminiContent = { role: string; parts: GeminiPart[] };

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
      throw new Error('gemini_network');
    }

    if (!res.ok) {
      if (modelUsed !== config.modelFallback) {
        modelUsed = config.modelFallback;
        continue;
      }
      throw new Error(`gemini_http_${res.status}`);
    }

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
    };
    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    const fnCalls = parts.filter((p) => p.functionCall?.name);

    if (fnCalls.length === 0) {
      const text = parts
        .map((p) => p.text || '')
        .filter(Boolean)
        .join('\n')
        .trim();
      return {
        text: text || DISCOVERY_FALLBACK_MSG,
        model: modelUsed,
        restaurants,
        toolCalls,
      };
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

  return {
    text: DISCOVERY_FALLBACK_MSG,
    model: modelUsed,
    restaurants,
    toolCalls,
    fallback: true,
  };
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
      };
    } catch {
      return {
        text: DISCOVERY_FALLBACK_MSG,
        model: 'fallback',
        restaurants: [],
        toolCalls: 0,
        fallback: true,
        skippedLlm: true,
      };
    }
  }

  try {
    return await runLiveDiscoveryGemini({ config, messages, ctx });
  } catch {
    // Soft degrade: directory path still available to the client.
    try {
      const sim = await runSimulatedDiscoveryAgent({ messages, ctx });
      return {
        text: sim.text || DISCOVERY_FALLBACK_MSG,
        model: 'directory-fallback',
        restaurants: sim.restaurants,
        toolCalls: sim.toolCalls,
        fallback: true,
        skippedLlm: true,
      };
    } catch {
      return {
        text: DISCOVERY_FALLBACK_MSG,
        model: 'fallback',
        restaurants: [],
        toolCalls: 0,
        fallback: true,
      };
    }
  }
}
