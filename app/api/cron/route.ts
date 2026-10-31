import { timingSafeEqual } from "node:crypto";
import { importRcbc } from "@/lib/import";

export const maxDuration = 300;

// The daily check (vercel.json crons). Vercel sends CRON_SECRET as a bearer token; without the secret set, it's off.
function fromVercel(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const sent = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return secret !== "" && sent.length === want.length && timingSafeEqual(sent, want);
}

export async function GET(request: Request) {
  if (!fromVercel(request)) return Response.json({ error: "Not found." }, { status: 404 });
  try { return Response.json(await importRcbc("daily check")); }
  catch (error) {
    console.error(error);
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
