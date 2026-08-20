import React, { createContext, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const NotificationContext = createContext<unknown>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth() as any;
  const session = auth?.session;

  const showNotification = useCallback((notification: any) => {
    // Replace with your actual UI toast/alert implementation
    console.log("New realtime notification:", notification);
  }, []);

  const playNotificationSound = useCallback((soundKey?: string) => {
    // Replace with your actual sound playback logic
    if (soundKey) {
      console.log("Playing notification sound:", soundKey);
    }
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;

    const channel = supabase
      .channel(`notifications:${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "app_notifications",
          filter: `recipient_user_id=eq.${session.user.id}`,
        },
        ({ new: notification }) => {
          showNotification(notification);
          playNotificationSound(notification.sound_key);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session?.user?.id, showNotification, playNotificationSound]);

  return (
    <NotificationContext.Provider value={{}}>
      {children}
    </NotificationContext.Provider>
  );
}