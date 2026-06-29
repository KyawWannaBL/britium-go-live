export type QrWorkflowAction =
  | "record-step"
  | "acknowledge"
  | "bump-reminder";

export type QrWorkflowEvent = {
  id: string;
  action: QrWorkflowAction;
  timestamp: string;
  payload?: unknown;
};

const STORAGE_KEY = "britium:qr-workflow-events";

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readEvents(): QrWorkflowEvent[] {
  if (!canUseLocalStorage()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEvents(events: QrWorkflowEvent[]): void {
  if (!canUseLocalStorage()) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Ignore storage errors so workflow actions never crash the UI.
  }
}

function createEvent(action: QrWorkflowAction, payload?: unknown): QrWorkflowEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    action,
    timestamp: new Date().toISOString(),
    payload,
  };
}

function saveEvent(action: QrWorkflowAction, payload?: unknown): QrWorkflowEvent {
  const event = createEvent(action, payload);
  const events = readEvents();

  writeEvents([event, ...events].slice(0, 200));

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("qr-workflow-updated", {
        detail: event,
      })
    );
  }

  return event;
}

export function recordQrWorkflowStep(...args: unknown[]): QrWorkflowEvent {
  return saveEvent("record-step", args.length <= 1 ? args[0] : args);
}

export function acknowledgeWorkflow(...args: unknown[]): QrWorkflowEvent {
  return saveEvent("acknowledge", args.length <= 1 ? args[0] : args);
}

export function bumpReminder(...args: unknown[]): QrWorkflowEvent {
  return saveEvent("bump-reminder", args.length <= 1 ? args[0] : args);
}
