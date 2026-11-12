import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const MODEL = 'llama-3.3-70b-versatile';
const destinations = new Set(['voice', 'meetings', 'people', 'ideas', 'projects', 'memory']);

type ChatTurn = { role: 'user' | 'assistant'; content: string };

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Sign in to use Founder Mind.' }, { status: 401 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return Response.json({ error: 'Founder Mind needs GROQ_API_KEY in the server environment.' }, { status: 503 });

  let body: { message?: unknown; history?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Send a valid message.' }, { status: 400 }); }
  if (typeof body.message !== 'string' || !body.message.trim()) return Response.json({ error: 'Write a message first.' }, { status: 400 });
  if (body.message.length > 6000) return Response.json({ error: 'Keep messages under 6,000 characters.' }, { status: 413 });

  const history: ChatTurn[] = Array.isArray(body.history)
    ? body.history.slice(-12).flatMap((turn): ChatTurn[] => {
      if (!turn || typeof turn !== 'object') return [];
      const item = turn as { role?: unknown; content?: unknown };
      if ((item.role !== 'user' && item.role !== 'assistant') || typeof item.content !== 'string') return [];
      return [{ role: item.role, content: item.content.slice(0, 3000) }];
    })
    : [];

  try {
    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      signal: request.signal,
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.35,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `You are Founder Mind, a thoughtful conversational assistant for a founder. Answer ordinary questions and casual messages normally and directly. Do not turn every message into a job. Choose type "job" only when the user clearly asks to execute, delegate, plan, or track a concrete piece of work. Questions, brainstorming, advice requests, greetings, and discussion are type "chat"; if an action is ambiguous, answer conversationally and ask a clarifying question.\n\nReturn one JSON object. For chat use {"type":"chat","answer":"..."}. For explicit work use {"type":"job","answer":"A short natural confirmation","title":"...","feature":"voice|meetings|people|ideas|projects|memory","due":"... or Unscheduled","plan":["...","..."]}. Select the best destination. Create 3 to 5 practical steps. Do not claim to have sent messages, assigned people, approved budgets, or completed external work. Never invent sources or company facts; ask when needed. Output valid JSON only.` },
          ...history,
          { role: 'user', content: body.message.trim() },
        ],
      }),
    });

    if (!upstream.ok) {
      const providerError = await upstream.json().catch(() => null);
      const providerMessage = typeof providerError?.error?.message === 'string'
        ? providerError.error.message.replaceAll(apiKey, '[redacted]').slice(0, 240)
        : '';
      if (upstream.status === 401) return Response.json({ error: 'Groq rejected GROQ_API_KEY. Check that the value is current and has no extra quotes or spaces.' }, { status: 401 });
      if (upstream.status === 429) return Response.json({ error: 'Groq rate limit or usage quota reached. Check Groq Console usage and try again.' }, { status: 429 });
      if (upstream.status === 400 || upstream.status === 404) {
        return Response.json({ error: `Groq rejected the model or request${providerMessage ? `: ${providerMessage}` : ` (HTTP ${upstream.status})`}` }, { status: 502 });
      }
      return Response.json({ error: `Groq returned HTTP ${upstream.status}${providerMessage ? `: ${providerMessage}` : '.'}` }, { status: 502 });
    }

    const payload = await upstream.json().catch(() => null);
    const raw = payload?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string') return Response.json({ error: 'Founder Mind returned an empty response.' }, { status: 502 });
    let result: Record<string, unknown>;
    try { result = JSON.parse(raw) as Record<string, unknown>; }
    catch { return Response.json({ error: 'Groq replied, but its response could not be read. Please send the message again.' }, { status: 502 }); }
    const answer = typeof result.answer === 'string' ? result.answer.slice(0, 5000) : '';
    if (result.type !== 'job') return Response.json({ type: 'chat', answer: answer || 'I’m here. What would you like to think through?' });

    const feature = typeof result.feature === 'string' && destinations.has(result.feature) ? result.feature : 'projects';
    const title = typeof result.title === 'string' && result.title.trim() ? result.title.trim().slice(0, 160) : body.message.trim().slice(0, 160);
    const due = typeof result.due === 'string' ? result.due.slice(0, 80) : 'Unscheduled';
    const plan = Array.isArray(result.plan) ? result.plan.filter((step): step is string => typeof step === 'string').slice(0, 5).map(step => step.slice(0, 220)) : [];
    return Response.json({ type: 'job', answer: answer || `I’ve added “${title}” to ${feature}.`, title, feature, due, plan });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return new Response(null, { status: 499 });
    return Response.json({ error: 'The server could not connect to Groq. Check the Vercel Function logs and try again.' }, { status: 502 });
  }
}
