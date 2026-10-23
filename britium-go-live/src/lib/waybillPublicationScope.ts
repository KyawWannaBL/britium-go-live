export function scopeReadySequences(ready: number[], sequence?: number): number[] {
  return sequence === undefined ? ready : ready.filter(value => value === sequence);
}
