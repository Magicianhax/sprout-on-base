export const PROTOCOL_DISPLAY_NAMES: Record<string, string> = {
  "aave-v3": "Aave V3",
  "morpho-v1": "Morpho",
  "morpho-v2": "Morpho V2",
  "euler-v2": "Euler V2",
  "pendle": "Pendle",
  "lido-wsteth": "Lido",
  "ether.fi-stake": "EtherFi",
  "ether.fi-liquid": "EtherFi Liquid",
  "ethena-usde": "Ethena",
  "felix-vanilla": "Felix",
  "hyperlend": "HyperLend",
  "maple": "Maple",
  "neverland": "Neverland",
  "usdai": "USDai",
  "seamless": "Seamless",
  "kinetiq": "Kinetiq",
  "upshift": "Upshift",
  "yo-protocol": "YO Protocol",
};

export function displayProtocol(name: string): string {
  return PROTOCOL_DISPLAY_NAMES[name] ?? name;
}
