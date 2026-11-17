// Gemini native REST API adapter.
//
// Uses the generateContent endpoint directly (not the OpenAI-compatible shim)
// so any Google AI Studio key — including the AQ.* format — works.
// API ref: https://ai.google.dev/api/generate-content
import { AiError, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared'
import { getT } from '@/lib/i18n/translate'

const t = getT('LibErrors')

// Gemini role names differ from OpenAI: "model" instead of "assistant".
function toGeminiRole(role: 'user' | 'assistant'): 'user' | 'model' {
  return role === 'assistant' ? 'model' : 'user'
}

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text?: string }[]
    }
  }[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
}

export async function generateGemini(args: ProviderArgs): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs } = args

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

  const contents = mergeConsecutive(messages).map((m) => ({
    role: toGeminiRole(m.role),
    parts: [{ text: m.content }],
  }))

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) throw await providerGeminiHttpError(res)

  const data = (await res.json().catch(() => null)) as GeminiResponse | null
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new AiError(t('ai.emptyResponse', { provider: 'Gemini' }), {
      code: 'empty_response',
    })
  }

  return {
    text,
    usage: normalizeUsage({
      prompt: data?.usageMetadata?.promptTokenCount,
      completion: data?.usageMetadata?.candidatesTokenCount,
      total: data?.usageMetadata?.totalTokenCount,
    }),
  }
}

// Gemini's error body shape differs from OpenAI — it uses { error: { message, status } }.
async function providerGeminiHttpError(res: Response): Promise<AiError> {
  let detail = ''
  try {
    const body = (await res.json()) as { error?: { message?: string; status?: string } }
    detail = body?.error?.message ?? ''
  } catch {
    // Non-JSON — fall through to status-based message.
  }

  const { status } = res
  const code =
    status === 400
      ? 'invalid_key'  // Gemini returns 400 for bad keys (not 401)
      : status === 401 || status === 403
        ? 'invalid_key'
        : status === 429
          ? 'rate_limited'
          : 'provider_error'

  const base =
    code === 'invalid_key'
      ? t('ai.invalidKey', { provider: 'Gemini' })
      : code === 'rate_limited'
        ? t('ai.rateLimited', { provider: 'Gemini' })
        : t('ai.apiError', { provider: 'Gemini', status: String(status) })

  return new AiError(detail ? `${base}: ${detail}` : base, {
    code,
    status: code === 'invalid_key' ? 401 : 502,
  })
}
