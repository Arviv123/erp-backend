import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onDone: (totalTokens: number) => void;
  onError: (err: Error) => void;
}

// ── Claude (Anthropic) ──────────────────────────────────────────────────────

export async function streamClaude(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ChatMessage[],
  cb: StreamCallbacks
): Promise<void> {
  const client = new Anthropic({ apiKey });
  let totalTokens = 0;
  try {
    const stream = await client.messages.stream({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        cb.onChunk(event.delta.text);
      }
    }
    const final = await stream.finalMessage();
    totalTokens = final.usage.input_tokens + final.usage.output_tokens;
    cb.onDone(totalTokens);
  } catch (e) {
    cb.onError(e as Error);
  }
}

// ── OpenAI / Grok (OpenAI-compatible) ──────────────────────────────────────

export async function streamOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ChatMessage[],
  cb: StreamCallbacks,
  baseURL?: string
): Promise<void> {
  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  let totalTokens = 0;
  try {
    const stream = await client.chat.completions.create({
      model,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
    });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? '';
      if (text) cb.onChunk(text);
      if (chunk.usage) totalTokens = chunk.usage.total_tokens;
    }
    cb.onDone(totalTokens);
  } catch (e) {
    cb.onError(e as Error);
  }
}

// ── Gemini ──────────────────────────────────────────────────────────────────

export async function streamGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ChatMessage[],
  cb: StreamCallbacks
): Promise<void> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const gemModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
  });
  try {
    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const lastMsg = messages[messages.length - 1]?.content ?? '';
    const chat = gemModel.startChat({ history });
    const result = await chat.sendMessageStream(lastMsg);
    let totalTokens = 0;
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) cb.onChunk(text);
    }
    const usage = (await result.response).usageMetadata;
    totalTokens = (usage?.totalTokenCount ?? 0);
    cb.onDone(totalTokens);
  } catch (e) {
    cb.onError(e as Error);
  }
}

// ── Provider router ─────────────────────────────────────────────────────────

export const PROVIDERS: Record<string, { label: string; models: { id: string; label: string }[]; baseURL?: string }> = {
  anthropic: {
    label: 'Claude (Anthropic)',
    models: [
      { id: 'claude-opus-4-6',           label: 'Claude Opus 4.6 (הכי חזק)' },
      { id: 'claude-sonnet-4-6',          label: 'Claude Sonnet 4.6 (מומלץ)' },
      { id: 'claude-haiku-4-5-20251001',  label: 'Claude Haiku 4.5 (מהיר וזול)' },
    ],
  },
  openai: {
    label: 'ChatGPT (OpenAI)',
    models: [
      { id: 'gpt-4o',        label: 'GPT-4o (מומלץ)' },
      { id: 'gpt-4o-mini',   label: 'GPT-4o Mini (מהיר)' },
      { id: 'gpt-4-turbo',   label: 'GPT-4 Turbo' },
    ],
  },
  gemini: {
    label: 'Gemini (Google)',
    models: [
      { id: 'gemini-2.0-flash',  label: 'Gemini 2.0 Flash (מומלץ)' },
      { id: 'gemini-1.5-pro',    label: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash',  label: 'Gemini 1.5 Flash (מהיר)' },
    ],
  },
  grok: {
    label: 'Grok (xAI)',
    baseURL: 'https://api.x.ai/v1',
    models: [
      { id: 'grok-2',         label: 'Grok-2' },
      { id: 'grok-2-vision',  label: 'Grok-2 Vision' },
      { id: 'grok-beta',      label: 'Grok Beta' },
    ],
  },
};

export async function streamProvider(
  provider: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ChatMessage[],
  cb: StreamCallbacks
): Promise<void> {
  switch (provider) {
    case 'anthropic':
      return streamClaude(apiKey, model, systemPrompt, messages, cb);
    case 'openai':
      return streamOpenAI(apiKey, model, systemPrompt, messages, cb);
    case 'gemini':
      return streamGemini(apiKey, model, systemPrompt, messages, cb);
    case 'grok':
      return streamOpenAI(apiKey, model, systemPrompt, messages, cb, 'https://api.x.ai/v1');
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
