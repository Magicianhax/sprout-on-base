import { NextResponse } from "next/server";
import { getLifiIntegrator } from "@/lib/lifiIntegrator";

// Returns the integrator name registered against our LI.FI API key.
// Client calls this once at SDK init to stamp routes with the correct
// integrator — fee-share attribution fails silently if the name
// doesn't match the Partner Portal registration.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, must-revalidate",
};

export async function GET() {
  const integrator = await getLifiIntegrator();
  if (!integrator) {
    // Falls back to a generic name client-side. The API still works;
    // the fee just won't attribute. We surface 200 so app boot isn't
    // blocked by a transient /keys/test outage.
    return NextResponse.json(
      { integrator: null },
      { headers: NO_STORE_HEADERS }
    );
  }
  return NextResponse.json({ integrator }, { headers: NO_STORE_HEADERS });
}
