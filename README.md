<p align="center">
  <img src="public/icon-512.png" alt="Sprout logo" width="128" height="128" />
</p>

<h1 align="center">Sprout — Base App</h1>

<p align="center"><em>Your money, growing on Base.</em></p>

The Base-only fork of [Sprout](../sprout/README.md), built for [base.dev](https://base.dev). One-tap deposits into the best Base yield vaults via LI.FI Earn. Lite mode auto-picks a vault, Pro mode opens the full Base vault explorer.

## Quick start

```bash
npm install
npm run dev
# → http://localhost:3000
```

See [`BASE-APP-SETUP.md`](./BASE-APP-SETUP.md) for the full setup, including
the base.dev registration form fields and the Builder Code env var.

## Required env (`.env.local`)

```
LIFI_API_KEY=...                       # LI.FI partner portal key
ALCHEMY_API_KEY=...                    # Base mainnet enabled
NEXT_PUBLIC_BASE_BUILDER_CODE=         # From base.dev > Settings > Builder Codes
```

Base Account auth needs no API key — it uses Coinbase's public infrastructure.

## What changed from sprout/

| | `sprout/` | `sprout-base/` |
|---|---|---|
| Chains | 5 (Eth, Base, Arb, OP, Polygon) | 1 (Base) |
| Bridges | LI.FI cross-chain | n/a — single chain |
| Wallet | Privy (email/Google/X + EOA) | **Base Account** (passkey-based smart wallet) via wagmi + `@base-org/account` |
| Auth | Privy login modal | **Sign In with Base** (SIWE) |
| Attribution | LI.FI integrator 25 bps | LI.FI 25 bps **+ Base Builder Code (ERC-8021)** |
| Surface | PWA (installable) | Standard web app, Base.dev-registered |
| Discovery | PWA install + share link | Base.dev listing |

Everything else — the hooks/cache architecture, the LI.FI Earn integration,
the deposit/withdraw orchestration, the Lite/Pro mode toggle — is unchanged.
Read the [parent project README](../sprout/README.md) for the full
architecture deep-dive.

## Auth architecture

- **`src/lib/wallet/provider.tsx`** — `WalletProvider` wraps the app with wagmi + React Query. Two connectors: `baseAccount({ appName: 'Sprout' })` (primary) and `injected()` (for power users with MetaMask/Rabby).
- **`src/lib/wallet/usePrivy.ts`** — compatibility shim. Same `{ ready, authenticated, user, login, logout }` shape the parent project's `usePrivy()` returned. `login()` runs SIWE: connect → sign EIP-4361 message → cache the session in localStorage (24h TTL). Re-uses the parent codebase's existing call sites with zero logic changes.
- **`src/lib/wallet/useWallets.ts`** — same idea: returns Privy-shaped `ConnectedWallet[]` with `address`, `chainId`, `switchChain()`, `getEthereumProvider()`. LI.FI SDK, deposit flow, withdraw executor, send modal all keep working unchanged.
- **`src/app/page.tsx`** — the official `<SignInWithBaseButton>` from `@base-org/account-ui/react`. Required by Base brand guidelines for registered Base Apps.
- **`next.config.ts`** — sets `Cross-Origin-Opener-Policy: same-origin-allow-popups`, otherwise the Base Account popup at `keys.coinbase.com` is blocked.

## How attribution works

`src/lib/attribution.ts` generates an ERC-8021 `dataSuffix` from your
Builder Code. `withAttribution()` wraps every `eth_sendTransaction`:

- LI.FI SDK txs — intercepted in `src/lib/lifi/sdk.ts` provider wrapper
  (covers approvals, deposits, bridges, LI.FI-routed withdraws).
- Direct ERC4626 redeem/withdraw — `src/lib/withdrawExecutor.ts`.
- Bare sends — `src/components/portfolio/SendModal.tsx`.

If `NEXT_PUBLIC_BASE_BUILDER_CODE` is empty, the suffix is a no-op and the
app still works — attribution is just skipped.

— `sprout-base@0.1.0` · forked from sprout for the Base App ecosystem
