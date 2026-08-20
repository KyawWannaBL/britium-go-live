// Britium Express - realtime assignment notification sound
// Drop this component into the authenticated Rider / Driver / Helper app shell.
//
// Browser rule: audio cannot start before the user has interacted with the page.
// This component automatically unlocks audio on the first normal tap/click/key press,
// then plays an audible chime for new unread assignment notifications.

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, Volume2, VolumeX } from "lucide-react";
import { supabase } from "../integrations/supabase/client";

type AssignmentNotificationSoundProps = {
  workerCode?: string;
  email?: string;
  role?: "rider" | "driver" | "helper" | string;
  onNewNotification?: (row: any) => void;
};

const SOUND_KEY = "britium_assignment_notification_sound_v1";

function txt(value: unknown) {
  return String(value ?? "").trim();
}

function isAssignmentNotification(row: any) {
  const kind = txt(row?.notification_type || row?.category).toUpperCase();
  const title = txt(row?.title).toUpperCase();
  const payloadEvent = txt(row?.payload?.event || row?.metadata?.event).toUpperCase();

  return (
    kind.includes("PICKUP_ASSIGNED") ||
    kind.includes("FIELD_ASSIGNMENT") ||
    kind.includes("ASSIGNMENT") ||
    title.includes("PICKUP ASSIGNED") ||
    payloadEvent === "ASSIGNED"
  );
}

export default function AssignmentNotificationSound({
  workerCode,
  email,
  role,
  onNewNotification,
}: AssignmentNotificationSoundProps) {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const [audioReady, setAudioReady] = useState(false);
  const [connectionState, setConnectionState] = useState("CONNECTING");
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastNotificationRef = useRef<string>("");

  const unlockAudio = useCallback(async (playTest = false) => {
    if (!enabled) return false;

    try {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;

      if (!AudioContextClass) return false;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }

      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") await ctx.resume();

      if (ctx.state === "running") {
        setAudioReady(true);

        // A very short confirmation tone only when the explicit sound button is used.
        if (playTest) {
          const oscillator = ctx.createOscillator();
          const gain = ctx.createGain();
          oscillator.type = "sine";
          oscillator.frequency.value = 880;
          gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
          oscillator.connect(gain);
          gain.connect(ctx.destination);
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.13);
        }

        return true;
      }
    } catch (error) {
      console.warn("Notification sound could not be unlocked", error);
    }

    return false;
  }, [enabled]);

  const playAssignmentChime = useCallback(async () => {
    if (!enabled) return;

    const ready = await unlockAudio(false);
    const ctx = audioContextRef.current;
    if (!ready || !ctx || ctx.state !== "running") return;

    const notes = [880, 1175, 880];
    const start = ctx.currentTime;

    notes.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const noteStart = start + index * 0.16;
      const noteEnd = noteStart + 0.13;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.20, noteStart + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.01);
    });

    try {
      if ("vibrate" in navigator) navigator.vibrate([180, 80, 180]);
    } catch {
      // Vibration is optional.
    }
  }, [enabled, unlockAudio]);

  const showSystemNotification = useCallback((row: any) => {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;

      const title = txt(row?.title) || "Britium Express assignment";
      const body =
        txt(row?.body || row?.message) ||
        (txt(row?.pickup_id) ? `Pickup ${txt(row.pickup_id)} was assigned to you.` : "A new assignment is available.");

      new Notification(title, {
        body,
        tag: txt(row?.event_key || row?.id || row?.pickup_id) || undefined,
        renotify: true,
      } as NotificationOptions);
    } catch (error) {
      console.warn("Browser notification could not be shown", error);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // This satisfies browser autoplay policy without forcing the user to find a
    // special setting: their first normal interaction with the app unlocks audio.
    const unlock = () => {
      void unlockAudio(false);
    };

    window.addEventListener("pointerdown", unlock, { once: true, capture: true });
    window.addEventListener("keydown", unlock, { once: true, capture: true });
    window.addEventListener("touchstart", unlock, { once: true, capture: true });

    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      window.removeEventListener("touchstart", unlock, true);
    };
  }, [enabled, unlockAudio]);

  useEffect(() => {
    let alive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function subscribe() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!alive) return;

      // The backend hotfix maps every selected Rider / Driver / Helper to a real
      // Auth UUID. Realtime therefore listens only to this authenticated user.
      if (!user?.id) {
        setConnectionState("AUTH REQUIRED");
        return;
      }

      const expectedEmail = txt(email || user.email).toLowerCase();
      const expectedCode = txt(workerCode).toLowerCase();
      const expectedRole = txt(role).toLowerCase();

      channel = supabase
        .channel(`assignment-sound-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "be_app_notifications",
            filter: `target_user_id=eq.${user.id}`,
          },
          (payload: any) => {
            const row = payload?.new || {};
            if (!isAssignmentNotification(row)) return;
            if (row?.is_read === true || txt(row?.status).toLowerCase() === "read") return;

            const rowId = txt(row?.id || row?.event_key || `${row?.pickup_id}-${row?.created_at}`);
            if (rowId && rowId === lastNotificationRef.current) return;
            lastNotificationRef.current = rowId;

            // Defense in depth in case a legacy notification carries multiple target fields.
            const targetId = txt(row?.target_user_id);
            const targetEmail = txt(row?.recipient_email || row?.target_email || row?.target_user_email).toLowerCase();
            const targetCode = txt(row?.target_user_code || row?.target_workforce_code || row?.payload?.workforce_code).toLowerCase();
            const targetRole = txt(row?.recipient_role || row?.target_role || row?.payload?.role).toLowerCase();

            if (targetId && targetId !== user.id) return;
            if (!targetId && expectedEmail && targetEmail && targetEmail !== expectedEmail) return;
            if (!targetId && expectedCode && targetCode && targetCode !== expectedCode) return;
            if (expectedRole && targetRole && targetRole !== expectedRole) return;

            void playAssignmentChime();
            showSystemNotification(row);
            onNewNotification?.(row);
          }
        )
        .subscribe((status) => {
          if (!alive) return;
          setConnectionState(status);
        });
    }

    void subscribe();

    return () => {
      alive = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [email, onNewNotification, playAssignmentChime, role, showSystemNotification, workerCode]);

  async function enableNotifications() {
    setEnabled(true);
    try {
      localStorage.setItem(SOUND_KEY, "on");
    } catch {
      // ignore storage restrictions
    }

    await unlockAudio(true);

    try {
      if ("Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } catch {
      // Browser notifications are optional. The in-app chime still works.
    }
  }

  function disableNotifications() {
    setEnabled(false);
    setAudioReady(false);
    try {
      localStorage.setItem(SOUND_KEY, "off");
    } catch {
      // ignore
    }
  }

  return (
    <div
      title={`Realtime: ${connectionState}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        border: "1px solid #1a3a5c",
        background: "#0b2236",
        borderRadius: 12,
        padding: "7px 10px",
        color: "#eef8ff",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      <BellRing size={15} color="#f6b84b" />
      {enabled ? (
        <button
          type="button"
          onClick={() => void enableNotifications()}
          style={{
            border: 0,
            background: "transparent",
            color: audioReady ? "#34d399" : "#f6b84b",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontWeight: 800,
          }}
        >
          <Volume2 size={15} />
          {audioReady ? "Assignment sound ON" : "Tap once for sound"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void enableNotifications()}
          style={{
            border: 0,
            background: "transparent",
            color: "#f87171",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontWeight: 800,
          }}
        >
          <VolumeX size={15} /> Enable assignment sound
        </button>
      )}

      {enabled && audioReady ? (
        <button
          type="button"
          onClick={disableNotifications}
          aria-label="Mute assignment sound"
          style={{
            border: 0,
            background: "transparent",
            color: "#6f91aa",
            cursor: "pointer",
            padding: 2,
          }}
        >
          <VolumeX size={14} />
        </button>
      ) : null}
    </div>
  );
}
