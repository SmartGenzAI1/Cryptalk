import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/auth'
import ZAI from 'z-ai-web-dev-sdk'

// Translate a message to a target language
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text, target } = await req.json()
  if (!text || !target) {
    return NextResponse.json({ error: 'text and target required' }, { status: 400 })
  }

  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'You are a professional translator. Translate the user text into the target language. Reply with ONLY the translated text, no explanation, no quotes.',
        },
        { role: 'user', content: `Target language: ${target}\n\nText: ${text}` },
      ],
      thinking: { type: 'disabled' },
    })
    const translation = completion.choices[0]?.message?.content?.trim() || text
    return NextResponse.json({ translation })
  } catch (e: any) {
    console.error('translate error', e)
    return NextResponse.json({ translation: text })
  }
}
