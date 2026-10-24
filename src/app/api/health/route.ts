import { getHealth } from "@/lib/server/health";

export const runtime = "nodejs";

export function GET() {
  return Response.json(getHealth(), {
    headers: { "Cache-Control": "no-store" },
  });
}
