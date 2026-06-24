import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/auth'
import ZAI from 'z-ai-web-dev-sdk'

// Generate 3 short smart-reply suggestions given recent conversation context
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { recentMessages } = await req.json()
  if (!Array.isArray(recentMessages) || recentMessages.length === 0) {
    return NextResponse.json({ replies: [] })
  }

  const transcript = recentMessages
    .map((m: any) => `${m.senderName}: ${m.content}`)
    .join('\n')

  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'You suggest 3 short, natural quick replies the user could send next in a chat. Reply with ONLY a JSON array of 3 strings, each under 60 characters. No commentary, no markdown fences.',
        },
        { role: 'user', content: `Conversation so far:\n${transcript}\n\nSuggest 3 short replies.` },
      ],
      thinking: { type: 'disabled' },
    })
    const raw = completion.choices[0]?.message?.content || '[]'
    let replies: string[] = []
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim()
      replies = JSON.parse(cleaned)
      if (!Array.isArray(replies)) replies = []
    } catch {
      replies = raw
        .split('\n')
        .map((s) => s.replace(/^\d+[\).\s-]+/, '').replace(/^"|"$/g, '').trim())
        .filter(Boolean)
        .slice(0, 3)
    }
    return NextResponse.json({ replies: replies.slice(0, 3) })
  } catch (e: any) {
    console.error('smart-reply error', e)
    return NextResponse.json({ replies: [] })
  }
}
