import { NextResponse } from "next/server";
import { getPluggyCredentials } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const { creds, source } = await getPluggyCredentials();
  return NextResponse.json({
    pluggyConfigured: Boolean(creds),
    pluggySource: source,
    databaseUrl: process.env.DATABASE_URL ?? null,
  });
}
