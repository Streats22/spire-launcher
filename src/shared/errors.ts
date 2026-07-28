/** Normalize unknown thrown values to a readable message (PSR-12 / DRY). */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
