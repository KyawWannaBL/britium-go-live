export type PendingClarificationCandidate = {
  saved?: boolean;
  skipped?: boolean;
  checking?: boolean;
  calculating?: boolean;
};

export function isPendingClarificationObstacle(value: unknown): boolean {
  return /clarification/i.test(String(value ?? ""));
}

export function selectPendingClarificationRows<T extends PendingClarificationCandidate>(
  rows: readonly T[],
  obstacleForRow: (row: T) => unknown,
): T[] {
  return rows.filter((row) =>
    !row.saved &&
    !row.skipped &&
    !row.checking &&
    !row.calculating &&
    isPendingClarificationObstacle(obstacleForRow(row))
  );
}

export function chunkRows<T>(rows: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) throw new Error("Batch size must be a positive integer.");
  const chunks: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += size) {
    chunks.push(rows.slice(offset, offset + size));
  }
  return chunks;
}
