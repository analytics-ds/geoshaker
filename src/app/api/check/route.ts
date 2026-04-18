import { NextRequest } from "next/server";
import { runAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }
  const url = body.url?.trim();
  if (!url) {
    return Response.json({ error: "URL manquante" }, { status: 400 });
  }
  if (url.length > 500) {
    return Response.json({ error: "URL trop longue" }, { status: 400 });
  }

  try {
    const result = await runAudit(url);
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Audit echoue : ${msg}` }, { status: 500 });
  }
}
