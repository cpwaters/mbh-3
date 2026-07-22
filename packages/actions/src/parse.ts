import type { ZodType } from 'zod';

// Adapts a Zod schema to the handler.parse contract. Parse, never cast —
// the first issue's path becomes the structured error's field.
export function zodParse<T>(schema: ZodType<T>) {
  return (input: unknown): { ok: true; payload: T } | { ok: false; message: string; field?: string } => {
    const result = schema.safeParse(input);
    if (result.success) {
      return { ok: true, payload: result.data };
    }
    const issue = result.error.issues[0];
    return {
      ok: false,
      message: issue?.message ?? 'Invalid payload.',
      ...(issue && issue.path.length > 0 ? { field: issue.path.join('.') } : {}),
    };
  };
}
