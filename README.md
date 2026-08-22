# Adevos Min-Bot

A unified platform that connects a public website, a WhatsApp bot, and a Telegram bot around a single account system. A user can create their website login through either bot, link both platforms to the same account, and manage their groups, sessions, and settings from one dashboard.

## Architecture

```
adevos-min-bot/
├── server.js                 Express entry point
├── config/
│   └── database.js           MongoDB connection
├── models/                   Mongoose schemas (User, Session, Groups, Settings, WhatsAppAuth)
├── middleware/
│   └── auth.js                JWT guards for user and admin routes
├── routes/                   REST API used by the website and admin panel
├── telegram/
│   └── bot.js                 Telegram bot: forced-subscription gate, account creation, pairing
├── whatsapp/
│   ├── socketManager.js       Multi-session WhatsApp connection manager
│   ├── mongoAuthState.js       Baileys auth state persisted in MongoDB (stateless server)
│   └── commandHandler.js       Core WhatsApp bot commands
├── utils/                    Password hashing, logging helpers
└── public/                   Website, dashboard, PWA assets, and the admin panel
    ├── index.html
    ├── admin.html              Served at /admin
    ├── app.js
    ├── admin.js
    ├── manifest.json
    └── sw.js
```

## Core design decisions

1. **Single source of truth.** The website, the WhatsApp bot, and the Telegram bot all read and write the same MongoDB collections. A setting changed on the website takes effect on the bot immediately, and vice versa.
2. **Stateless WhatsApp sessions.** Baileys credentials are stored in the `WhatsAppAuth` collection instead of the local filesystem, so the server can be redeployed or moved to a new machine without losing active sessions.
3. **Chat-first account creation.** There is no public sign-up form. A website account is only created through `/createlogins <username>` on Telegram or `.createlogins <username>` in a private WhatsApp chat, which prevents junk accounts with no real bot behind them.
4. **Account linking.** A single `User` document can hold both a `telegramId` and a `whatsappNumber`, so a user who starts on one platform can link the other later from their dashboard or with `/link <username>` on Telegram.
5. **Admin isolation.** The admin panel lives at `/admin`, authenticates with separate credentials (`ADMIN_USERNAME` / `ADMIN_PASSWORD`), and issues its own JWT scope so an operator token can never access admin routes.

## Setup

```bash
npm install
cp .env.example .env
# edit .env with your MongoDB URI, JWT secret, Telegram bot token, and admin credentials
npm start
```

## Environment variables

See `.env.example` for the full list. Nothing sensitive is ever hard-coded in the source; every secret is read from `process.env` at runtime.

## Extending the WhatsApp command set

`whatsapp/commandHandler.js` intentionally ships with a small, secure core command set (`menu`, `ping`, `createlogins`, `set`, `groupinfo`, `dashboard`). Add further commands as additional `case` blocks in the same switch statement, following the existing pattern of reading and writing through the Mongoose models so the website stays in sync automatically.

## Deployment notes

- Deploy the frontend and backend together (this is a single Express app serving both), or deploy `public/` separately to a static host and point it at this API with `BASE_URL`.
- Use MongoDB Atlas (or any managed MongoDB) so sessions persist across restarts and redeployments.
- Run the process under a process manager (for example PM2) so it restarts automatically on crashes and reconnects WhatsApp sessions on boot via `resumeAllSessions()`.
