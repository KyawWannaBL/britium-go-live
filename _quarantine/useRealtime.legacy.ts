import { useEffect, useRef, useState, useCallback } from 'react';
import type { DeliveryStatus, TaskStatus, Employee } from '@/lib';

type RealtimeEventType = 
  | 'delivery_status_changed'
  | 'task_assigned'
  | 'task_updated'
  | 'notification'
  | 'location_updated'
  | 'manifest_updated'
  | 'shipment_created'
  | 'connection_status';

interface RealtimeEvent {
  type: RealtimeEventType;
  payload: any;
  timestamp: string;
}

interface DeliveryStatusEvent {
  deliveryId: string;
  shipmentId: string;
  oldStatus: DeliveryStatus;
  newStatus: DeliveryStatus;
  updatedBy: string;
  timestamp: string;
}

interface TaskAssignedEvent {
  taskId: string;
  assignedTo: string;
  assignedBy: string;
  priority: string;
  dueDate?: string;
  timestamp: string;
}

interface TaskUpdatedEvent {
  taskId: string;
  status: TaskStatus;
  updatedBy: string;
  timestamp: string;
}

interface NotificationEvent {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  actionUrl?: string;
  timestamp: string;
}

interface LocationUpdateEvent {
  employeeId: string;
  location: {
    lat: number;
    lng: number;
  };
  timestamp: string;
}

type EventHandler<T = any> = (event: T) => void;

interface UseRealtimeOptions {
  url?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  autoConnect?: boolean;
}

interface UseRealtimeReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  subscribe: <T = any>(eventType: RealtimeEventType, handler: EventHandler<T>) => () => void;
  unsubscribe: (eventType: RealtimeEventType, handler: EventHandler) => void;
  send: (eventType: RealtimeEventType, payload: any) => void;
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
}

const DEFAULT_OPTIONS: Required<UseRealtimeOptions> = {
  url: import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws',
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
  autoConnect: true,
};

export function useRealtime(options: UseRealtimeOptions = {}): UseRealtimeReturn {
  const config = { ...DEFAULT_OPTIONS, ...options };
  
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const eventHandlersRef = useRef<Map<RealtimeEventType, Set<EventHandler>>>(new Map());
  const messageQueueRef = useRef<Array<{ type: RealtimeEventType; payload: any }>>([]);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const flushMessageQueue = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    while (messageQueueRef.current.length > 0) {
      const message = messageQueueRef.current.shift();
      if (message) {
        wsRef.current.send(JSON.stringify(message));
      }
    }
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data: RealtimeEvent = JSON.parse(event.data);
      const handlers = eventHandlersRef.current.get(data.type);
      
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(data.payload);
          } catch (err) {
            console.error(`Error in event handler for ${data.type}:`, err);
          }
        });
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
    }
  }, []);

  const handleOpen = useCallback(() => {
    setIsConnected(true);
    setIsConnecting(false);
    setError(null);
    reconnectAttemptsRef.current = 0;
    clearReconnectTimeout();
    
    flushMessageQueue();
    
    const handlers = eventHandlersRef.current.get('connection_status');
    if (handlers) {
      handlers.forEach(handler => handler({ status: 'connected', timestamp: new Date().toISOString() }));
    }
  }, [clearReconnectTimeout, flushMessageQueue]);

  const handleClose = useCallback(() => {
    setIsConnected(false);
    setIsConnecting(false);
    
    const handlers = eventHandlersRef.current.get('connection_status');
    if (handlers) {
      handlers.forEach(handler => handler({ status: 'disconnected', timestamp: new Date().toISOString() }));
    }
    
    if (reconnectAttemptsRef.current < config.maxReconnectAttempts) {
      reconnectAttemptsRef.current += 1;
      const delay = Math.min(config.reconnectInterval * reconnectAttemptsRef.current, 30000);
      
      reconnectTimeoutRef.current = setTimeout(() => {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          connect();
        }
      }, delay);
    } else {
      setError(new Error('Max reconnection attempts reached'));
    }
  }, [config.maxReconnectAttempts, config.reconnectInterval]);

  const handleError = useCallback((event: Event) => {
    const errorMessage = 'WebSocket connection error';
    setError(new Error(errorMessage));
    setIsConnecting(false);
    
    const handlers = eventHandlersRef.current.get('connection_status');
    if (handlers) {
      handlers.forEach(handler => handler({ status: 'error', error: errorMessage, timestamp: new Date().toISOString() }));
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }
    
    setIsConnecting(true);
    setError(null);
    
    try {
      const ws = new WebSocket(config.url);
      
      ws.onopen = handleOpen;
      ws.onclose = handleClose;
      ws.onerror = handleError;
      ws.onmessage = handleMessage;
      
      wsRef.current = ws;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create WebSocket connection'));
      setIsConnecting(false);
    }
  }, [config.url, handleOpen, handleClose, handleError, handleMessage]);

  const disconnect = useCallback(() => {
    clearReconnectTimeout();
    reconnectAttemptsRef.current = config.maxReconnectAttempts;
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setIsConnecting(false);
  }, [clearReconnectTimeout, config.maxReconnectAttempts]);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    setTimeout(() => connect(), 100);
  }, [connect, disconnect]);

  const subscribe = useCallback(<T = any>(eventType: RealtimeEventType, handler: EventHandler<T>): (() => void) => {
    if (!eventHandlersRef.current.has(eventType)) {
      eventHandlersRef.current.set(eventType, new Set());
    }
    
    const handlers = eventHandlersRef.current.get(eventType)!;
    handlers.add(handler as EventHandler);
    
    return () => {
      handlers.delete(handler as EventHandler);
      if (handlers.size === 0) {
        eventHandlersRef.current.delete(eventType);
      }
    };
  }, []);

  const unsubscribe = useCallback((eventType: RealtimeEventType, handler: EventHandler) => {
    const handlers = eventHandlersRef.current.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        eventHandlersRef.current.delete(eventType);
      }
    }
  }, []);

  const send = useCallback((eventType: RealtimeEventType, payload: any) => {
    const message = {
      type: eventType,
      payload,
      timestamp: new Date().toISOString(),
    };
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      messageQueueRef.current.push(message);
    }
  }, []);

  useEffect(() => {
    if (config.autoConnect) {
      connect();
    }
    
    return () => {
      clearReconnectTimeout();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [config.autoConnect, connect, clearReconnectTimeout]);

  return {
    isConnected,
    isConnecting,
    error,
    subscribe,
    unsubscribe,
    send,
    connect,
    disconnect,
    reconnect,
  };
}

export type {
  RealtimeEvent,
  RealtimeEventType,
  DeliveryStatusEvent,
  TaskAssignedEvent,
  TaskUpdatedEvent,
  NotificationEvent,
  LocationUpdateEvent,
  EventHandler,
  UseRealtimeOptions,
  UseRealtimeReturn,
};
