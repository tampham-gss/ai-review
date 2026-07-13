import { AI_PROVIDER_REGISTRY } from "@/lib/ai/provider-registry";
import { PROVIDER_MODELS } from "@/lib/ai/provider-models";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    providers: AI_PROVIDER_REGISTRY,
    models: PROVIDER_MODELS,
  });
}
