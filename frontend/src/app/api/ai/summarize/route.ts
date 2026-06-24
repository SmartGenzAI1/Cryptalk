import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/auth'
import ZAI from 'z-ai-web-dev-sdk'

// Summarize a batch of messages
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages } = await req.json()
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ summary: 'No messages to summarize.' })
  }

  const transcript = messages
    .map((m: any) => `${m.senderName || 'Someone'}: ${m.content}`)
    .join('\n')

  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'You summarize chat conversations. Produce a concise summary (3-5 bullet points) of the key topics, decisions, and action items. Use plain text bullets with a "• " prefix. Be friendly and clear.',
        },
        { role: 'user', content: `Summarize this conversation:\n\n${transcript}` },
      ],
      thinking: { type: 'disabled' },
    })
    const summary = completion.choices[0]?.message?.content || 'Could not generate summary.'
    return NextResponse.json({ summary })
  } catch (e: any) {
    console.error('summarize error', e)
    return NextResponse.json({ summary: 'Could not generate summary right now.' })
  }
}
