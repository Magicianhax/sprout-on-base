import {
  SUPPORTED_CHAIN_IDS,
  VAULT_MAX_PAGES,
  VAULT_PAGE_SIZE,
} from "@/lib/constants";
import type {
  Vault,
  VaultsResponse,
  Chain,
  PositionsResponse,
} from "@/lib/types";
import {
  ApiShapeError,
  isPositionsResponse,
  isVaultsResponse,
} from "@/lib/schemas";

// Earn API doesn't support CORS — all calls proxied through /api/earn/
const API_BASE = "/api/earn";

async function getJson(url: string, endpoint: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${endpoint} error: ${res.status}`);
  }
  return res.json().catch(() => {
    throw new ApiShapeError(endpoint);
  });
}

// Raw fetch — returns the API response as-is without any client-side filter.
// Used internally by the paginator so early breaks aren't triggered by the
// SUPPORTED_CHAIN_IDS filter eating entire pages.
async function fetchVaultsRaw(params?: {
  chainId?: number;
  asset?: string;
  sortBy?: "tvl" | "apy";
  limit?: number;
  cursor?: string;
}): Promise<VaultsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.chainId) searchParams.set("chainId", String(params.chainId));
  if (params?.asset) searchParams.set("asset", params.asset);
  if (params?.sortBy) searchParams.set("sortBy", params.sortBy);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.cursor) searchParams.set("cursor", params.cursor);

  const json = await getJson(
    `${API_BASE}/v1/vaults?${searchParams}`,
    "vaults"
  );
  if (!isVaultsResponse(json)) {
    throw new ApiShapeError("vaults");
  }
  return json;
}

export async function fetchVaults(params?: {
  chainId?: number;
  asset?: string;
  sortBy?: "tvl" | "apy";
  limit?: number;
  cursor?: string;
}): Promise<VaultsResponse> {
  const data = await fetchVaultsRaw(params);
  if (!params?.chainId) {
    data.data = data.data.filter((v) =>
      SUPPORTED_CHAIN_IDS.includes(v.chainId as typeof SUPPORTED_CHAIN_IDS[number])
    );
  }
  return data;
}

// Paginate one chain's vaults. Emits cumulative-for-that-chain
// snapshots via onChainPage. Used directly when the caller
// requested a specific chainId, and as the parallel worker of the
// per-chain fan-out below.
async function streamSingleChain(
  params: {
    chainId: number;
    asset?: string;
    sortBy?: "tvl" | "apy";
    pageSize: number;
    maxPages: number;
  },
  onChainPage: (chainVaults: Vault[]) => void
): Promise<Vault[]> {
  const seen = new Set<string>();
  const chainVaults: Vault[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < params.maxPages; page++) {
    const res = await fetchVaultsRaw({
      chainId: params.chainId,
      asset: params.asset,
      sortBy: params.sortBy,
      limit: params.pageSize,
      cursor,
    });

    for (const v of res.data) {
      const key = `${v.chainId}-${v.address}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chainVaults.push(v);
    }
    onChainPage([...chainVaults]);

    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return chainVaults;
}

// Stream pages of vaults as they arrive. `onPage` is called after each
// page with the cumulative (deduped, chain-filtered) list so callers
// can render progressively without waiting for every page.
//
// When no chainId is specified, we fan out one parallel paginator per
// SUPPORTED_CHAIN_ID instead of paginating the global all-chains list.
// Reason: the Earn API orders by TVL across every chain, and the top
// TVL vaults are dominated by non-Sprout chains (Monad, Katana,
// Hyperliquid, Avalanche). A single global paginator would exhaust
// maxPages on those unsupported entries and only surface a handful
// of our supported-chain vaults before stopping. Per-chain pagination
// gives each supported chain its own maxPages budget, so coverage is
// fair and every chain's deep inventory shows up in the grid.
export async function fetchVaultsStreaming(
  params: {
    chainId?: number;
    asset?: string;
    sortBy?: "tvl" | "apy";
    pageSize?: number;
    maxPages?: number;
  },
  onPage: (cumulative: Vault[]) => void
): Promise<Vault[]> {
  const pageSize = params.pageSize ?? VAULT_PAGE_SIZE;
  const maxPages = params.maxPages ?? VAULT_MAX_PAGES;

  // Single chain — straight pagination.
  if (params.chainId) {
    return streamSingleChain(
      { ...params, chainId: params.chainId, pageSize, maxPages },
      onPage
    );
  }

  // Fan out across supported chains. Merge every chain-page into one
  // deduped cumulative list and emit after every update so React
  // consumers see the grid filling from all chains in parallel.
  const seen = new Set<string>();
  const cumulative: Vault[] = [];
  // Guard against setState-storms: re-emit at most once per
  // animation frame even when multiple chains fire page updates
  // simultaneously.
  let scheduledFlush: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    scheduledFlush = null;
    onPage([...cumulative]);
  };
  const scheduleFlush = () => {
    if (scheduledFlush) return;
    scheduledFlush = setTimeout(flush, 16);
  };

  const workers = SUPPORTED_CHAIN_IDS.map((chainId) =>
    streamSingleChain(
      {
        chainId,
        asset: params.asset,
        sortBy: params.sortBy,
        pageSize,
        maxPages,
      },
      (chainVaults) => {
        for (const v of chainVaults) {
          const key = `${v.chainId}-${v.address}`;
          if (seen.has(key)) continue;
          seen.add(key);
          cumulative.push(v);
        }
        scheduleFlush();
      }
    ).catch((err) => {
      // Per-chain errors shouldn't abort the whole grid — log and
      // move on so the user still sees vaults from the chains that
      // did respond.
      console.warn(`[earn] chain ${chainId} stream failed`, err);
      return [];
    })
  );

  await Promise.all(workers);
  if (scheduledFlush) clearTimeout(scheduledFlush);
  onPage([...cumulative]);
  return cumulative;
}

// Non-streaming convenience wrapper — resolves once every page is in.
// Shares the exact same pagination path as the streaming variant.
export async function fetchAllVaults(params?: {
  chainId?: number;
  asset?: string;
  sortBy?: "tvl" | "apy";
  pageSize?: number;
  maxPages?: number;
}): Promise<VaultsResponse> {
  const data = await fetchVaultsStreaming(params ?? {}, () => {});
  return { data, nextCursor: undefined, total: data.length };
}

export async function fetchChains(): Promise<Chain[]> {
  const json = await getJson(`${API_BASE}/v1/chains`, "chains");
  if (!Array.isArray(json)) throw new ApiShapeError("chains");
  return json as Chain[];
}

export async function fetchProtocols(): Promise<{ name: string; url?: string }[]> {
  const json = await getJson(`${API_BASE}/v1/protocols`, "protocols");
  if (!Array.isArray(json)) throw new ApiShapeError("protocols");
  return json as { name: string; url?: string }[];
}

export async function fetchPositions(address: string): Promise<PositionsResponse> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error("Invalid wallet address");
  }
  const json = await getJson(
    `${API_BASE}/v1/portfolio/${address}/positions`,
    "positions"
  );
  if (!isPositionsResponse(json)) {
    throw new ApiShapeError("positions");
  }
  return json;
}
