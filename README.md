# ledger-app

Expo app (iOS + Android + web) for Ledger. Talks to `ledger-backend` for auth, watchlist quotes, and AI analysis.

## Prerequisites

- Node 20+
- `ledger-backend` running on http://localhost:3001 (see `../ledger-backend/README.md`)
- For iOS simulator: Xcode 15+
- For TestFlight builds: `npm i -g eas-cli` and an Apple Developer account

## First-time setup

```bash
cd ledger-app
npm install

cp .env.example .env
# Default EXPO_PUBLIC_API_BASE=http://localhost:3001 works for local dev.
```

## Run it

```bash
npm run web       # opens in browser at http://localhost:8081
npm run ios       # iOS simulator (requires Xcode)
npm run android   # Android emulator
```

Sign in with the email + password you created via `npm run seed` in `ledger-backend`.

## Tabs

- **Watchlist** — live prices from Finnhub (stocks/ETFs) + CoinGecko (crypto). Tap a row for AI analysis. Long-press to remove. Pull to refresh. Auto-refreshes every 60s while open.
- **Portfolio / Accounts / Spending / Bills** — "coming soon" placeholders for Layers 2-6 with the planned features outlined.

## Project layout

```
ledger-app/
├── app.json
├── app/
│   ├── _layout.tsx        Auth gate + providers (React Query, SafeArea)
│   ├── index.tsx          Redirect to /(tabs)
│   ├── login.tsx
│   └── (tabs)/
│       ├── _layout.tsx    Bottom tab bar
│       ├── index.tsx      Watchlist (default tab)
│       ├── portfolio.tsx, accounts.tsx, spending.tsx, bills.tsx
├── components/
│   ├── ScreenHeader.tsx
│   ├── WatchlistRow.tsx
│   ├── AddAssetModal.tsx
│   ├── AnalysisModal.tsx
│   └── StubScreen.tsx
├── lib/
│   ├── api.ts             Typed fetch wrapper + DTOs
│   ├── auth.tsx           AuthProvider + useAuth (persists via SecureStore / localStorage)
│   ├── storage.ts         Platform-aware SecureStore wrapper
│   └── format.ts          Money / percent / relative-time formatters
└── theme/
    └── colors.ts          Design tokens
```

## Deploying

### Web

```bash
EXPO_PUBLIC_API_BASE=https://api.ledger.yourdomain.com npx expo export -p web
```

Output goes to `dist/`. Deploy to Cloudflare Pages, Vercel, Netlify, or S3 + CloudFront.

**Important:** `EXPO_PUBLIC_API_BASE` is baked into the bundle at build time — you cannot change it at runtime. Always set it before exporting.

### iOS

```bash
eas build -p ios --profile production
eas submit -p ios
```

Set `EXPO_PUBLIC_API_BASE` in `eas.json` under the production profile's `env` block, not in your shell.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Login spins forever | Backend not running | `cd ledger-backend && npm run dev` |
| CORS error in browser | `CORS_ORIGIN` mismatch | Set `CORS_ORIGIN=http://localhost:8081` in backend `.env`, restart backend |
| Watchlist rows show "Finnhub key needed" | No `FINNHUB_API_KEY` in backend | Sign up at finnhub.io (free), add to backend `.env`, restart |
| Analysis modal says "AI analysis requires…" | No `ANTHROPIC_API_KEY` in backend | Add to backend `.env`, restart |
| Crypto rows show "Symbol not mapped" | Symbol missing from CoinGecko ID map | Add it to `SYMBOL_TO_ID` in `ledger-backend/src/services/coingecko.ts` |
