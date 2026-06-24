import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/auth'
import ZAI from 'z-ai-web-dev-sdk'

const SYSTEM_PROMPT = `You are Cryptalk AI, the friendly assistant built into Cryptalk (a modern Telegram-style messenger). You are helpful, concise, and upbeat. You can help users brainstorm ideas, draft messages, answer questions, translate, summarize, and chat casually. Keep replies fairly short and well-formatted with light markdown when useful. Use emojis sparingly.`

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message, history } = await req.json()
  if (!message || !message.trim()) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 })
  }

  const prevHistory = (history || []).slice(-10)
  const messages = [
    { role: 'assistant', content: SYSTEM_PROMPT },
    ...prevHistory,
    { role: 'user', content: message },
  ]

  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
    })
    const reply = completion.choices[0]?.message?.content || '...'

    return NextResponse.json({
      reply,
      history: [...prevHistory, { role: 'user', content: message }, { role: 'assistant', content: reply }],
    })
  } catch (e: any) {
    console.error('AI assistant error', e)
    return NextResponse.json({ error: 'AI service error: ' + e.message }, { status: 500 })
  }
}
