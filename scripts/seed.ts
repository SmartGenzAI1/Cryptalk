import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function main() {
  const demoUsers = [
    { username: 'alex', name: 'Alex Rivera', bio: 'Designer & coffee enthusiast', avatarColor: 'rose', avatarEmoji: 'fox' },
    { username: 'sam', name: 'Sam Chen', bio: 'Building cool things', avatarColor: 'cyan', avatarEmoji: 'dolphin' },
    { username: 'priya', name: 'Priya Sharma', bio: 'Product manager - traveler', avatarColor: 'amber', avatarEmoji: 'butterfly' },
    { username: 'marco', name: 'Marco Rossi', bio: 'Pizza lover', avatarColor: 'purple', avatarEmoji: 'lion' },
    { username: 'emma', name: 'Emma Wilson', bio: 'Photographer & hiker', avatarColor: 'teal', avatarEmoji: 'owl' },
  ]

  const users: any[] = []
  for (const u of demoUsers) {
    const user = await db.user.upsert({
      where: { username: u.username },
      update: { avatarEmoji: u.avatarEmoji },
      create: { ...u, passwordHash: hashPassword('password123') },
    })
    users.push(user)
    await db.chat.upsert({
      where: { id: `saved-${user.id}` },
      update: { avatarEmoji: 'bookmark' },
      create: {
        id: `saved-${user.id}`,
        type: 'saved',
        title: 'Saved Messages',
        avatarEmoji: 'bookmark',
        avatarColor: 'emerald',
        createdBy: user.id,
        members: { create: { userId: user.id, role: 'owner' } },
      },
    })
  }

  const welcome = await db.chat.upsert({
    where: { id: 'welcome-channel' },
    update: { avatarEmoji: 'megaphone', title: 'Welcome to Cryptalk' },
    create: {
      id: 'welcome-channel',
      type: 'channel',
      title: 'Welcome to Cryptalk',
      description: 'Announcements & tips for new members',
      avatarEmoji: 'megaphone',
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
      { senderId: users[0].id, content: 'Welcome to Cryptalk! Secure messaging, no phone required.' },
      { senderId: users[1].id, content: 'Messages appear instantly via real-time WebSockets.' },
      { senderId: users[2].id, content: 'Right-click a message to react, reply, edit, or forward it.' },
      { senderId: users[3].id, content: 'Create groups with the + button. Set expiration for temp events.' },
      { senderId: users[0].id, content: 'Your messages are end-to-end encrypted. Stay safe out there.' },
    ]
    for (const sm of seedMessages) {
      await db.message.create({
        data: {
          chatId: welcome.id,
          senderId: sm.senderId,
          content: sm.content,
          type: 'text',
          createdAt: new Date(Date.now() - (5 - seedMessages.indexOf(sm)) * 60000),
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
    await db.message.create({ data: { chatId: group.id, senderId: users[1].id, content: 'Morning team! Ready to ship?', createdAt: new Date(Date.now() - 30 * 60000) } })
    await db.message.create({ data: { chatId: group.id, senderId: users[3].id, content: 'Always! Just finalized the color system.', createdAt: new Date(Date.now() - 25 * 60000) } })
    await db.message.create({ data: { chatId: group.id, senderId: users[2].id, content: "Let's review at standup.", createdAt: new Date(Date.now() - 20 * 60000) } })
  }

  console.log('Seed complete')
  console.log('Demo accounts (password: password123):')
  demoUsers.forEach((u) => console.log(`  ${u.username} / ${u.name}`))
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await db.$disconnect() })
