import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle, Bell, Package, Truck, MapPin, Clock } from 'lucide-react';
import { useRealtime } from '@/hooks/useRealtime';
import type { NotificationEvent, DeliveryStatusEvent, TaskAssignedEvent, TaskUpdatedEvent, LocationUpdateEvent } from '@/hooks/useRealtime';
import { formatStatus, formatDate } from '@/lib';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  icon: React.ReactNode;
  actionUrl?: string;
  timestamp: string;
  read: boolean;
}

const NOTIFICATION_ICONS = {
  info: <Info className="w-5 h-5" />,
  success: <CheckCircle className="w-5 h-5" />,
  warning: <AlertTriangle className="w-5 h-5" />,
  error: <AlertCircle className="w-5 h-5" />,
};

const NOTIFICATION_COLORS = {
  info: 'bg-accent text-accent-foreground',
  success: 'bg-chart-3 text-white',
  warning: 'bg-chart-4 text-white',
  error: 'bg-destructive text-destructive-foreground',
};

const AUTO_DISMISS_DURATION = 4000;
const MAX_VISIBLE_TOASTS = 3;

export function NotificationPanel() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const { isConnected, subscribe } = useRealtime();

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      read: false,
    };

    setNotifications(prev => [newNotification, ...prev]);
    setUnreadCount(prev => prev + 1);

    setToasts(prev => {
      const updated = [newNotification, ...prev];
      return updated.slice(0, MAX_VISIBLE_TOASTS);
    });

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== newNotification.id));
    }, AUTO_DISMISS_DURATION);
  }, []);

  useEffect(() => {
    const unsubscribeNotification = subscribe<NotificationEvent>('notification', (event) => {
      addNotification({
        title: event.title,
        message: event.message,
        type: event.type,
        icon: NOTIFICATION_ICONS[event.type],
        actionUrl: event.actionUrl,
        timestamp: event.timestamp,
      });
    });

    const unsubscribeDeliveryStatus = subscribe<DeliveryStatusEvent>('delivery_status_changed', (event) => {
      const statusLabel = formatStatus(event.newStatus);
      addNotification({
        title: 'Delivery Status Updated',
        message: `Shipment ${event.shipmentId} is now ${statusLabel}`,
        type: event.newStatus === 'delivered' ? 'success' : event.newStatus === 'failed' ? 'error' : 'info',
        icon: <Package className="w-5 h-5" />,
        timestamp: event.timestamp,
      });
    });

    const unsubscribeTaskAssigned = subscribe<TaskAssignedEvent>('task_assigned', (event) => {
      addNotification({
        title: 'New Task Assigned',
        message: `You have been assigned a new ${event.priority} priority task`,
        type: event.priority === 'urgent' ? 'warning' : 'info',
        icon: <Clock className="w-5 h-5" />,
        timestamp: event.timestamp,
      });
    });

    const unsubscribeTaskUpdated = subscribe<TaskUpdatedEvent>('task_updated', (event) => {
      addNotification({
        title: 'Task Updated',
        message: `Task ${event.taskId} status changed to ${event.status}`,
        type: event.status === 'completed' ? 'success' : 'info',
        icon: <CheckCircle className="w-5 h-5" />,
        timestamp: event.timestamp,
      });
    });

    const unsubscribeLocation = subscribe<LocationUpdateEvent>('location_updated', (event) => {
      addNotification({
        title: 'Location Updated',
        message: `Driver location updated`,
        type: 'info',
        icon: <MapPin className="w-5 h-5" />,
        timestamp: event.timestamp,
      });
    });

    return () => {
      unsubscribeNotification();
      unsubscribeDeliveryStatus();
      unsubscribeTaskAssigned();
      unsubscribeTaskUpdated();
      unsubscribeLocation();
    };
  }, [subscribe, addNotification]);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  const clearNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <>
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="pointer-events-auto"
            >
              <div className={`${NOTIFICATION_COLORS[toast.type]} rounded-xl shadow-lg p-4 min-w-[320px] max-w-[400px] backdrop-blur-sm`}>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {toast.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm mb-1">{toast.title}</h4>
                    <p className="text-sm opacity-90 line-clamp-2">{toast.message}</p>
                    <p className="text-xs opacity-70 mt-1">{formatDate(toast.timestamp, 'time')}</p>
                  </div>
                  <button
                    onClick={() => dismissToast(toast.id)}
                    className="flex-shrink-0 hover:opacity-70 transition-opacity"
                    aria-label="Dismiss notification"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(!isOpen)}
          className="relative"
          aria-label="Open notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>

        <AnimatePresence>
          {isOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40"
                onClick={() => setIsOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="absolute right-0 top-12 z-50 w-[400px] bg-card border border-border rounded-xl shadow-lg overflow-hidden"
              >
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">Notifications</h3>
                    {!isConnected && (
                      <Badge variant="secondary" className="text-xs">
                        Offline
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={markAllAsRead}
                        className="text-xs"
                      >
                        Mark all read
                      </Button>
                    )}
                    {notifications.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAllNotifications}
                        className="text-xs"
                      >
                        Clear all
                      </Button>
                    )}
                  </div>
                </div>

                <ScrollArea className="h-[500px]">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                      <Bell className="w-12 h-12 text-muted-foreground mb-3" />
                      <p className="text-muted-foreground">No notifications yet</p>
                      <p className="text-sm text-muted-foreground mt-1">You'll see updates here when they arrive</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {notifications.map((notification) => (
                        <motion.div
                          key={notification.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className={`p-4 hover:bg-muted/50 transition-colors ${
                            !notification.read ? 'bg-accent/5' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`flex-shrink-0 p-2 rounded-lg ${NOTIFICATION_COLORS[notification.type]}`}>
                              {notification.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <h4 className="font-semibold text-sm">{notification.title}</h4>
                                {!notification.read && (
                                  <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1" />
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">{notification.message}</p>
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(notification.timestamp, 'datetime')}
                                </p>
                                <div className="flex items-center gap-2">
                                  {!notification.read && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => markAsRead(notification.id)}
                                      className="text-xs h-7"
                                    >
                                      Mark read
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => clearNotification(notification.id)}
                                    className="text-xs h-7"
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}