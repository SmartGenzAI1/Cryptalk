-- ════════════════════════════════════════════════════════
-- Cryptalk — Supabase PostgreSQL Schema
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS "User" (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    email TEXT UNIQUE,
    username TEXT UNIQUE,
    name TEXT,
    "passwordHash" TEXT NOT NULL,
    bio TEXT DEFAULT '',
    "avatarColor" TEXT DEFAULT 'emerald',
    "avatarEmoji" TEXT DEFAULT 'fox',
    "isOnline" BOOLEAN DEFAULT false,
    "isOnboarded" BOOLEAN DEFAULT false,
    "lastSeen" BIGINT DEFAULT (extract(epoch from now()) * 1000)::bigint,
    "accentColor" TEXT DEFAULT 'emerald',
    wallpaper TEXT DEFAULT 'dots',
    "createdAt" BIGINT DEFAULT (extract(epoch from now()) * 1000)::bigint,
    "updatedAt" BIGINT DEFAULT (extract(epoch from now()) * 1000)::bigint,
    "identityPublicKey" TEXT,
    "signingPublicKey" TEXT,
    "signedPreKeyPublic" TEXT,
    "signedPreKeySignature" TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_username ON "User"(username);
CREATE INDEX IF NOT EXISTS idx_user_email ON "User"(email);

CREATE TABLE IF NOT EXISTS "Chat" (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    type TEXT DEFAULT 'direct',
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    "avatarColor" TEXT DEFAULT 'emerald',
    "avatarEmoji" TEXT DEFAULT 'chat',
    "createdBy" TEXT,
    "createdAt" BIGINT DEFAULT (extract(epoch from now()) * 1000)::bigint,
    "updatedAt" BIGINT DEFAULT (extract(epoch from now()) * 1000)::bigint,
    "expiresAt" BIGINT,
    "inviteToken" TEXT
);
CREATE INDEX IF NOT EXISTS idx_chat_invite_token ON "Chat"("inviteToken");

CREATE TABLE IF NOT EXISTS "ChatMember" (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    "chatId" TEXT NOT NULL REFERENCES "Chat"(id) ON DELETE CASCADE,
    "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member',
    "joinedAt" BIGINT DEFAULT (extract(epoch from now()) * 1000)::bigint,
    "lastReadAt" BIGINT DEFAULT (extract(epoch from now()) * 1000)::bigint,
    "pinnedAt" BIGINT,
    muted BOOLEAN DEFAULT false,
    "pinnedMessageId" TEXT,
    UNIQUE("chatId", "userId")
);
CREATE INDEX IF NOT EXISTS idx_chatmember_user ON "ChatMember"("userId");
CREATE INDEX IF NOT EXISTS idx_chatmember_chat ON "ChatMember"("chatId");

CREATE TABLE IF NOT EXISTS "Message" (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    "chatId" TEXT NOT NULL REFERENCES "Chat"(id) ON DELETE CASCADE,
    "senderId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    "replyToId" TEXT REFERENCES "Message"(id),
    "editedAt" BIGINT,
    "createdAt" BIGINT DEFAULT (extract(epoch from now()) * 1000)::bigint,
    "deletedAt" BIGINT,
    duration INTEGER,
    "expiresIn" INTEGER,
    status TEXT DEFAULT 'sent',
    "readBy" TEXT,
    "deliveredTo" TEXT
);
CREATE INDEX IF NOT EXISTS idx_message_chat_created ON "Message"("chatId", "createdAt");

CREATE TABLE IF NOT EXISTS "Reaction" (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    "messageId" TEXT NOT NULL REFERENCES "Message"(id) ON DELETE CASCADE,
    "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    "createdAt" BIGINT DEFAULT (extract(epoch from now()) * 1000)::bigint,
    UNIQUE("messageId", "userId", emoji)
);
CREATE INDEX IF NOT EXISTS idx_reaction_message ON "Reaction"("messageId");

CREATE TABLE IF NOT EXISTS "StarredMessage" (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    "messageId" TEXT NOT NULL REFERENCES "Message"(id) ON DELETE CASCADE,
    "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    "chatId" TEXT NOT NULL,
    "createdAt" BIGINT DEFAULT (extract(epoch from now()) * 1000)::bigint,
    UNIQUE("messageId", "userId")
);

CREATE TABLE IF NOT EXISTS "UserBlock" (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    "blockerId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    "blockedId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    "createdAt" BIGINT DEFAULT (extract(epoch from now()) * 1000)::bigint,
    UNIQUE("blockerId", "blockedId")
);
CREATE INDEX IF NOT EXISTS idx_block_blocker ON "UserBlock"("blockerId");
CREATE INDEX IF NOT EXISTS idx_block_blocked ON "UserBlock"("blockedId");

CREATE TABLE IF NOT EXISTS "UserNickname" (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    "ownerId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    "targetUserId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL,
    "createdAt" BIGINT DEFAULT (extract(epoch from now()) * 1000)::bigint,
    UNIQUE("ownerId", "targetUserId")
);
CREATE INDEX IF NOT EXISTS idx_nickname_owner ON "UserNickname"("ownerId");

CREATE TABLE IF NOT EXISTS "ConnectionRequest" (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    "fromUserId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    "toUserId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',
    "createdAt" BIGINT DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_conn_from ON "ConnectionRequest"("fromUserId");
CREATE INDEX IF NOT EXISTS idx_conn_to ON "ConnectionRequest"("toUserId");

CREATE TABLE IF NOT EXISTS "Report" (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    "reporterId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    "reportedId" TEXT REFERENCES "User"(id) ON DELETE CASCADE,
    "chatId" TEXT,
    "messageId" TEXT,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    "createdAt" BIGINT DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_report_reporter ON "Report"("reporterId");

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Chat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StarredMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserNickname" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConnectionRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Report" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON "User" FOR SELECT USING (true);
CREATE POLICY "users_update_own" ON "User" FOR UPDATE USING (id = current_setting('app.current_user_id', true));
CREATE POLICY "chats_select_member" ON "Chat" FOR SELECT USING (
    id IN (SELECT "chatId" FROM "ChatMember" WHERE "userId" = current_setting('app.current_user_id', true))
);
CREATE POLICY "messages_select_member" ON "Message" FOR SELECT USING (
    "chatId" IN (SELECT "chatId" FROM "ChatMember" WHERE "userId" = current_setting('app.current_user_id', true))
);
CREATE POLICY "chatmembers_select" ON "ChatMember" FOR SELECT USING (
    "chatId" IN (SELECT "chatId" FROM "ChatMember" cm2 WHERE cm2."userId" = current_setting('app.current_user_id', true))
);
