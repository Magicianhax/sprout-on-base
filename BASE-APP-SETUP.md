# Sprout — Base App setup

This is the Base-only fork of Sprout. The codebase is identical to `sprout/`
except:

- Every chain other than Base (8453) is removed from `src/lib/constants.ts`.
- Auth is **Sign In with Base** (Base Account smart wallet + SIWE) via
  wagmi + `@base-org/account` — Privy is gone. Compatibility shim at
  `src/lib/wallet/` keeps the existing 20+ call sites of `usePrivy()` /
  `useWallets()` working with only an import-path swap.
- Every `eth_sendTransaction` carries an ERC-8021 Base Builder Code suffix
  (via `src/lib/attribution.ts`), so Base.dev attributes activity to Sprout
  and we earn referral fees.
- `next.config.ts` sets `Cross-Origin-Opener-Policy: same-origin-allow-popups`
  so the Base Account sign-in popup at `keys.coinbase.com` isn't blocked.

## One-time setup

### 1. Install

```bash
cd sprout-base
npm install
```

### 2. Register on base.dev

Base App is now a "standard web app + wallet" model — there is **no**
Farcaster manifest, no `/.well-known/farcaster.json`, no mini-app SDK.
Discovery happens through [base.dev](https://base.dev). Register Sprout
once with these fields:

| Field | Value |
|---|---|
| **Name** | Sprout |
| **Tagline** | Earn on Base, in two taps. |
| **Description** | A savings app on Base. Auto-picks the best yield vault, handles approvals + deposits in one flow. Lite mode for newcomers, Pro mode for full vault control. Built on LI.FI Earn. |
| **Category** | Finance / DeFi |
| **Primary URL** | `https://<your-deploy-domain>` |
| **Icon** | `public/icon-512.png` |
| **Screenshots** | `public/screenshots/*.png` (home-lite, home-pro, portfolio) |
| **Builder Code** | Generated under Settings > Builder Codes on base.dev |
| **App ID** | Auto-assigned on registration. Hardcoded into `src/app/layout.tsx` as the `base:app_id` meta tag (currently `6a0378cf7651490b2dee3644`). |

### 3. Paste the Builder Code

```bash
# .env.local
NEXT_PUBLIC_BASE_BUILDER_CODE=<paste-your-code-here>
```

### 3b. (Optional) Paste the Base Notifications API key

If you want Sprout to push "deposit confirmed" / "withdrawal complete" to
users via Base App, grab an API key from base.dev > your project >
Settings > API Key and add:

```bash
# .env.local — server-only
BASE_API_KEY=<paste-your-key-here>
```

The notification path is gated twice:
1. **Sprout side** — `usePreferences.notificationsEnabled` (toggled in
   Settings). Off by default.
2. **Base side** — only delivered to wallets that pinned the app in
   Base App and enabled notifications there.

Without `BASE_API_KEY` set, every deposit/withdraw still works; the
in-app push is just skipped.

Restart the dev server. `withAttribution()` now appends the ERC-8021 suffix
to every `eth_sendTransaction` Sprout makes — including LI.FI-routed
approvals, deposits, and bridges. If the env var is missing, the app still
works; attribution is simply skipped.

### 4. Verify attribution

After your first deposit:

1. Find the tx hash on basescan.org.
2. View Input Data — the last bytes should end in `8021` repeating.
3. Check `base.dev > Onchain > Total Transactions` for your code.
4. Or paste the tx hash into [builder-code-checker.vercel.app](https://builder-code-checker.vercel.app/).

## Run

```bash
npm run dev
# → http://localhost:3000
```

## What's the same as sprout/

- Lite mode: auto-picks the highest-APY safe Base vault, one-tap deposit.
- Pro mode: full vault explorer with protocol/asset/search filters,
  per-position partial withdraw, manual source-token picker.
- LI.FI Earn integration unchanged — same `/api/lifi/...` proxies, same
  `integrator=sprout_app` attribution, same 25 bps fee share.

## What's different

| | `sprout/` | `sprout-base/` |
|---|---|---|
| Chains | Ethereum, Base, Arbitrum, Optimism, Polygon | Base only |
| Cross-chain bridges | Yes | No (single chain, bridge step is a no-op) |
| Smart withdraw planner | Sorts by APY + chain-gas penalty | Sorts by APY + balance |
| Wallet stack | Privy (email/Google/X/wallet, EOA embedded wallet) | **wagmi + `@base-org/account`** (Sign In with Base, smart wallet) |
| Auth flow | Privy login modal | **Sign In with Base** (passkey) + SIWE |
| Surface | PWA (installable on home screen) | Standard web app, Base.dev-registered |
| Attribution | LI.FI 25 bps | LI.FI 25 bps **+ Base Builder Code** |

## Why this stack

Base's [migrate-to-standard-web-app.md](https://docs.base.org/apps/guides/migrate-to-standard-web-app)
(Apr 2026) recommends `wagmi + viem + @base-org/account` for new Base
Apps. sprout-base uses that exact stack:

- `@base-org/account` — Base Account SDK, the passkey-based smart wallet
- `@base-org/account-ui` — the official `<SignInWithBaseButton>` (brand
  guidelines require it for registered Base Apps)
- `wagmi` + `@tanstack/react-query` — connector framework and request layer
- `viem/siwe` — SIWE message construction
- `ox/erc8021` — Builder Code attribution suffix

Privy is gone. A tiny compatibility shim at `src/lib/wallet/` exposes
the parent project's `usePrivy()` / `useWallets()` API surface backed
by wagmi, so the 20+ downstream files (deposit flow, withdraw executor,
LI.FI integration) keep working without per-file rewrites.
