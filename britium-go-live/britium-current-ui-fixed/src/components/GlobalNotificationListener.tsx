import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  playNotificationSound,
  unlockNotificationSound,
} from "@/lib/notificationSound";

type NotificationRow = {
  id: string;
  pickup_id?: string | null;
  target_user_id?: string | null;
  title?: string | null;
  message?: string | null;
  body?: string | null;
  status?: string | null;
  is_read?: boolean | null;
  created_at?: string | null;
};

export function GlobalNotificationListener() {
  const handledIds = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;

    async function subscribe() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (
        cancelled ||
        !session?.user?.id
      ) {
        return;
      }

      const userId = session.user.id;

      const handleNotification = (
        notification: NotificationRow,
      ) => {
        if (
          notification.target_user_id !== userId ||
          notification.is_read === true ||
          notification.status?.toLowerCase() === "read"
        ) {
          return;
        }

        if (handledIds.current.has(notification.id)) {
          return;
        }

        handledIds.current.add(notification.id);

        window.dispatchEvent(
          new CustomEvent("britium:notification", {
            detail: notification,
          }),
        );

        void playNotificationSound();
      };

      const channel = supabase
        .channel(`app-notifications:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "be_app_notifications",
            filter: `target_user_id=eq.${userId}`,
          },
          ({ new: row }) =>
            handleNotification(
              row as NotificationRow,
            ),
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "be_app_notifications",
            filter: `target_user_id=eq.${userId}`,
          },
          ({ new: row }) =>
            handleNotification(
              row as NotificationRow,
            ),
        )
        .subscribe((status) => {
          console.log(
            "Global notification channel:",
            status,
          );
        });

      return channel;
    }

    let activeChannel:
      | Awaited<ReturnType<typeof subscribe>>
      | undefined;

    void subscribe().then((channel) => {
      activeChannel = channel;
    });

    const unlock = () => {
      void unlockNotificationSound();
    };

    window.addEventListener("pointerdown", unlock, {
      once: true,
    });

    return () => {
      cancelled = true;
      window.removeEventListener(
        "pointerdown",
        unlock,
      );

      if (activeChannel) {
        void supabase.removeChannel(activeChannel);
      }
    };
  }, []);

  return null;
}