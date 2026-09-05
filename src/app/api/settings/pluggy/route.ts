import { NextResponse } from "next/server";
import { badRequest, readJson } from "@/lib/http";
import { PluggyClient, PluggyError } from "@/lib/pluggy/client";
import { clearPluggyCredentials, getPluggyCredentials, savePluggyCredentials } from "@/lib/settings";

export const dynamic = "force-dynamic";

function mask(id: string): string {
  return id.length <= 8 ? "••••" : `${id.slice(0, 4)}…${id.slice(-4)}`;
}

/** GET → estado atual, sem expor o secret. */
export async function GET() {
  const { creds, source } = await getPluggyCredentials();
  return NextResponse.json({
    configured: Boolean(creds),
    source,
    clientIdMasked: creds ? mask(creds.clientId) : null,
  });
}

/** PUT { clientId, clientSecret } → testa em POST /auth e, se aceitas, grava no banco. */
export async function PUT(req: Request) {
  const body = await readJson<{ clientId?: string; clientSecret?: string }>(req);
  const clientId = body.clientId?.trim();
  const clientSecret = body.clientSecret?.trim();
  if (!clientId || !clientSecret) return badRequest("Informe clientId e clientSecret.");

  try {
    await new PluggyClient({ clientId, clientSecret }).testCredentials();
  } catch (e) {
    const msg = e instanceof PluggyError ? e.message : `Não foi possível validar na Pluggy: ${(e as Error).message}`;
    return badRequest(msg, 502);
  }

  await savePluggyCredentials({ clientId, clientSecret });
  return NextResponse.json({ ok: true, source: "db", clientIdMasked: mask(clientId) });
}

/** DELETE → remove do banco (o .env, se existir, volta a valer). */
export async function DELETE() {
  await clearPluggyCredentials();
  const { creds, source } = await getPluggyCredentials();
  return NextResponse.json({ ok: true, configured: Boolean(creds), source });
}
