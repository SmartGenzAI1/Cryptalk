// Seed script: creates demo users + a welcome channel with messages
// Run with: bun run seed

import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function main() {
  console.log('Seeding database...')

  const demoUsers = [
    { username: 'cryptalk-ai', name: 'Cryptalk AI', bio: 'Your friendly AI assistant inside Cryptalk', avatarColor: 'violet', avatarEmoji: 'unicorn' },
    { username: 'alex', name: 'Alex Rivera', bio: 'Designer & coffee enthusiast', avatarColor: 'rose', avatarEmoji: 'fox' },
    { username: 'sam', name: 'Sam Chen', bio: 'Building cool things', avatarColor: 'cyan', avatarEmoji: 'dolphin' },
    { username: 'priya', name: 'Priya Sharma', bio: 'Product manager - traveler', avatarColor: 'amber', avatarEmoji: 'butterfly' },
    { username: 'marco', name: 'Marco Rossi', bio: 'Pizza lover', avatarColor: 'purple', avatarEmoji: 'lion' },
  ]

  const users: any[] = []
  for (const u of demoUsers) {
    const user = await db.user.upsert({
      where: { username: u.username },
      update: { avatarEmoji: u.avatarEmoji }, // update icon for existing users
      create: { ...u, passwordHash: hashPassword('password123') },
    })
    users.push(user)
    await db.chat.upsert({
      where: { id: `saved-${user.id}` },
      update: { avatarEmoji: 'bookmark--v1' },
      create: {
        id: `saved-${user.id}`,
        type: 'saved',
        title: 'Saved Messages',
        avatarEmoji: 'bookmark--v1',
        avatarColor: 'emerald',
        createdBy: user.id,
        members: { create: { userId: user.id, role: 'owner' } },
      },
    })
  }

  const welcome = await db.chat.upsert({
    where: { id: 'welcome-channel' },
    update: { avatarEmoji: 'megaphone--v1', title: 'Welcome to Cryptalk' },
    create: {
      id: 'welcome-channel',
      type: 'channel',
      title: 'Welcome to Cryptalk',
      description: 'Announcements & tips for new members',
      avatarEmoji: 'megaphone--v1',
      avatarColor: 'emerald',
      createdBy: users[0].id,
      members: {
        create: users.map((u, i) => ({ userId: u.id, role: i === 0 ? 'owner' : 'member' })),
      },
    },
  })

  const existingMsgs = await db.message.count({ where: { chatId: welcome.id } })
  if (existingMsgs === 0) {
    const seedMessages = [
      { senderId: users[0].id, content: 'Welcome to Cryptalk! The secure messenger with AI superpowers.', offset: 0 },
      { senderId: users[1].id, content: 'This place is fast - messages appear instantly via real-time WebSockets.', offset: 1 },
      { senderId: users[2].id, content: 'Try right-clicking a message to react, reply, edit, or translate it!', offset: 2 },
      { senderId: users[3].id, content: 'Tip: open the AI Assistant (sparkles icon in the sidebar) to draft messages & summarize chats.', offset: 3 },
      { senderId: users[0].id, content: 'Create groups & channels with the + button. Enjoy chatting!', offset: 4 },
    ]
    for (const sm of seedMessages) {
      await db.message.create({
        data: {
          chatId: welcome.id,
          senderId: sm.senderId,
          content: sm.content,
          type: 'text',
          createdAt: new Date(Date.now() - (5 - sm.offset) * 60000),
        },
      })
    }
  }

  const group = await db.chat.upsert({
    where: { id: 'design-team' },
    update: { avatarEmoji: 'groups' },
    create: {
      id: 'design-team',
      type: 'group',
      title: 'Design Team',
      description: 'Where pixels meet purpose',
      avatarEmoji: 'groups',
      avatarColor: 'rose',
      createdBy: users[1].id,
      members: {
        create: users.slice(1).map((u, i) => ({ userId: u.id, role: i === 0 ? 'owner' : 'member' })),
      },
    },
  })
  const groupMsgs = await db.message.count({ where: { chatId: group.id } })
  if (groupMsgs === 0) {
    await db.message.create({
      data: { chatId: group.id, senderId: users[1].id, content: 'Morning team! Ready to ship some beautiful UI today?', createdAt: new Date(Date.now() - 30 * 60000) },
    })
    await db.message.create({
      data: { chatId: group.id, senderId: users[3].id, content: 'Always! Just finalized the new color system.', createdAt: new Date(Date.now() - 25 * 60000) },
    })
    await db.message.create({
      data: { chatId: group.id, senderId: users[2].id, content: "Love it. Let's review at standup.", createdAt: new Date(Date.now() - 20 * 60000) },
    })
  }

  console.log('Seed complete!')
  console.log('Demo accounts (password: password123):')
  demoUsers.forEach((u) => console.log(`  - ${u.username} / ${u.name} (icon: ${u.avatarEmoji})`))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
