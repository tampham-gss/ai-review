import { z } from "zod";
import { AI_PROVIDER_IDS } from "@/lib/ai/provider-registry";

export const aiProviderIdSchema = z.enum(
  AI_PROVIDER_IDS as [string, ...string[]],
);

export const aiProviderPayloadSchema = z.object({
  provider: aiProviderIdSchema,
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional().nullable(),
  model: z.string().optional().nullable(),
  tokenLimit: z.number().int().positive().optional().nullable(),
  priority: z.number().int().optional(),
  isDefault: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
});

export const aiProviderCreateSchema = aiProviderPayloadSchema.extend({
  apiKey: z.string().optional(),
});

export const aiProviderPatchSchema = aiProviderPayloadSchema.partial();

export const aiProviderTestSchema = z.object({
  provider: aiProviderIdSchema,
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional().nullable(),
  model: z.string().optional(),
});
