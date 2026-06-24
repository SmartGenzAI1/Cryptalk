# Cryptalk — System Design

## Overview

```
Client (Web / Flutter)
  ↕ HTTPS + WebSocket
Backend (FastAPI + Socket.IO)
  ↕
Database (SQLite / Supabase PostgreSQL)
```

The server is zero-knowledge: it stores only encrypted ciphertext and public keys. Private keys never leave the client device.

## Backend Layers

```
API (thin controllers) → Service (business logic) → Repository (data access) → Model (ORM)
```

## E2EE Flow

```
Client A: generate keypair → private key in IndexedDB/Keychain
                            → public key uploaded to server
Client B: fetch A's public key → ECDH → shared secret → encrypt
Encrypted ciphertext → server routes (cannot decrypt)
Client A: decrypt with private key (never left device)
```

## Ephemeral Storage

Messages are wiped from the server after all recipients confirm delivery. Only the message record stays for conversation continuity.

## Realtime

Socket.IO for presence, typing indicators, message delivery, and status updates. No polling.

## Database

- Dev: SQLite (auto-created on startup)
- Prod: Supabase PostgreSQL with Row Level Security

## Clients

- Web: Next.js 16 (Vercel)
- Mobile: Flutter (iOS, Android — APK built via GitHub Actions)
- Desktop: Flutter (macOS, Windows, Linux)
