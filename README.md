# Pack — AI-first fitness + diet tracker

30-second logging (text / voice / photo) in any language. The LLM classifies; the user just talks.
Log your whole day in one message — food and training packed into a single note. That's the name: **Pack**.

Full product/architecture spec: see `../Pack-Fitness-App-Blueprint.md`.

## Monorepo layout
```
pack/
  packages/
    db/          Prisma schema + Supabase RLS migrations
    parser/      Claude parser: system prompt, tool schema, router, eval harness
  apps/
    api/         Next.js route handler (POST /api/parse, GET /api/insights)
    mobile/      Expo (React Native) app — Today / Insights / Me
prototype/       Static HTML prototype — open in a browser to test the UX, no Android Studio
```

## Setup
```bash
cp .env.example .env            # fill ANTHROPIC_API_KEY + Supabase URLs
npm install                     # root (npm workspaces)
npm run db:generate             # prisma generate
npm run db:migrate              # push schema + RLS to Supabase
npm run eval                    # run the parser eval harness (needs ANTHROPIC_API_KEY)
```

## Test the UX with no toolchain
Open `prototype/index.html` in any browser (or run `npm run prototype`). It calls a tiny
local proxy that hits the real Claude parser, so you can paste messy multi-lingual logs
and watch them parse — without Expo or Android Studio. See `prototype/README.md`.

## The wedge in one file
`packages/parser/src/systemPrompt.ts` + `toolSchema.ts` are the whole product bet.
Everything else renders their output.
