// Thin client wrapper around /api/notify. Fires-and-forgets — a notify
// failure must NEVER block or rollback the transaction flow that
// invoked it. Notifications are a nice-to-have on top of a successful
// on-chain action.
//
// Delivery is gated twice:
//   1. Sprout-side: usePreferences.notificationsEnabled (off by default;
//      user opts in from Settings)
//   2. Base-side: only delivered to wallets that have pinned the app
//      in Base App and enabled notifications there
//
// So sending here is best-effort. If the user has muted notifications
// in either place, the call is a no-op (Sprout side) or silently
// dropped at Base.

interface SendNotificationArgs {
  walletAddress: string;
  title: string;
  message: string;
  /** Path within the app to deep-link to. Must start with "/". */
  targetPath?: string;
}

export async function sendBaseNotification(
  args: SendNotificationArgs
): Promise<void> {
  try {
    await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddresses: [args.walletAddress],
        title: args.title,
        message: args.message,
        targetPath: args.targetPath,
      }),
      cache: "no-store",
      // Short timeout — notifications are fire-and-forget; we don't
      // want them to keep the deposit/withdraw flow's success state
      // pending for long.
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    // Swallow. Logging is fine but the user already saw the success
    // modal — surfacing a notify failure would just be noise.
  }
}
