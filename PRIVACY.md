# Cryptalk Privacy Policy

**Last updated: August 2026**

## What We Collect

Cryptalk collects the **absolute minimum** data required to operate:

| Data | Why | Stored |
|------|-----|--------|
| Email address | Account authentication & recovery | Yes (hashed password + email) |
| Username | User identification in chats | Yes |
| Password | Authentication (bcrypt-hashed, never plaintext) | Yes (hash only) |
| Display name | Optional profile personalization | Yes (if provided) |
| E2EE keys | End-to-end encryption | Yes (public keys only) |

## What We Do NOT Collect

- **Phone numbers** — never required, never stored
- **IP addresses** — never logged or stored
- **Device information** — no device fingerprinting, no user-agent logging
- **Location data** — no geolocation, no IP-based location
- **Message content** — all messages are end-to-end encrypted; the server only relays ciphertext
- **File metadata** — uploaded files have metadata stripped and are stored with random filenames
- **Usage analytics** — no behavioral tracking, no analytics SDKs
- **Contacts** — no access to your address book
- **Push notification tokens** — anonymous push only, no device identifiers stored

## End-to-End Encryption (E2EE)

- All messages, voice calls, and file transfers are encrypted on your device before sending
- The server only sees opaque ciphertext and cannot decrypt your content
- Encryption keys are generated and stored on your device
- The server stores only public keys needed for key exchange

## Data Retention

- **90-day auto-delete**: All account data is automatically deleted after 90 days of inactivity
- **Messages are never stored**: Messages are relay-only and exist only on sender/recipient devices
- **File retention**: Uploaded files are automatically deleted after delivery confirmation
- **Account deletion**: You can delete your account at any time, which immediately removes all stored data

## Logging

- All logs are anonymized by default
- No personally identifiable information (PII) appears in logs
- Email addresses, IP addresses, and user IDs are automatically redacted
- Error reports contain no user data

## Third-Party Services

- **Supabase**: Used for file storage only (encrypted ciphertext). No user metadata is stored.
- **Sentry**: Error tracking configured with zero PII collection. No user context is attached.
- **Redis**: Used only for WebSocket scaling and rate limiting. No personal data stored.

## Your Rights

- Access, correct, or delete your data at any time
- Export your data
- Opt out of optional data collection (last seen, privacy settings)
- Withdraw consent for data processing

## Changes to This Policy

We will notify users of any changes to this policy via in-app notification.

## Contact

For privacy-related inquiries, contact us at the email associated with your account.
