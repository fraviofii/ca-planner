import { NextResponse } from "next/server";
import { badRequest } from "@/lib/http";
import { importSkillJson, type ImportResult } from "@/lib/import-json";

export const dynamic = "force-dynamic";

/** POST /api/import — multipart/form-data com um ou mais campos "files" (JSON da skill). */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("Envie multipart/form-data com arquivos JSON.");
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return badRequest("Nenhum arquivo enviado.");

  const results: ImportResult[] = [];
  for (const f of files) results.push(await importSkillJson(f.name, await f.text()));
  return NextResponse.json({ results });
}
