# DocuMend API

Accounts, plans and document **metadata**. The document text never reaches this
server — that stays in the browser (see `docs/encryption.md` when S3 lands).

Fastify 5 · Prisma · Postgres · JWT.

## Setup (once)

```bash
cd api
npm install
```

1. **Get a database.** Easiest is [neon.tech](https://neon.tech) — free, nothing
   to install: sign up → *New project* → copy the connection string.
2. `copy .env.example .env` (Windows) and paste the connection string into
   `DATABASE_URL`.
3. Put a long random value in `JWT_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
4. Create the tables:
   ```bash
   npx prisma migrate dev --name init
   ```

## Running

```bash
npm run dev      # http://localhost:4000, restarts on save
npm run studio   # a browser view of the database
```

Check it is alive:

```bash
curl http://localhost:4000/health
```

## Routes

| Method | Route | Needs a token | What it does |
| --- | --- | --- | --- |
| GET | `/health` | no | server + database are up |
| POST | `/auth/signup` | no | `{ email, name, password }` → user + tokens |
| POST | `/auth/login` | no | `{ email, password }` → user + tokens |
| POST | `/auth/refresh` | no | `{ refreshToken }` → a new access token |
| POST | `/auth/logout` | no | `{ refreshToken }` → that device is signed out |
| GET | `/auth/me` | yes | the signed-in user |
| GET | `/documents` | yes | metadata for this account |
| PUT | `/documents/:id` | yes | add/update metadata |
| DELETE | `/documents/:id` | yes | mark deleted |

Send the access token as `Authorization: Bearer <token>`.

## The two tokens

- **access token** — JWT, 15 minutes, sent with every request, checked without
  touching the database.
- **refresh token** — random string, 30 days, stored as a SHA-256 hash in the
  `Session` table. It can be revoked, which is what signing out does.

## Passwords

`scrypt` from Node's own crypto module, with a random 16-byte salt per user.
No native packages to compile, and the password itself is never stored.

## What this server refuses

`PUT /documents/:id` rejects any body containing `content`, `html`, `text`,
`body` or `plainText` with **400 content_not_allowed**. A privacy promise that
is only in the documentation is not a promise; this one is in the code.
