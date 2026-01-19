import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface UseRealtimeOptions {
  table: string;
  schema?: string;
  event?: RealtimeEvent;
  filter?: string;
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  onDelete?: (payload: any) => void;
  onChange?: (payload: any) => void;
}

export function useRealtime({
  table,
  schema = 'public',
  event = '*',
  filter,
  onInsert,
  onUpdate,
  onDelete,
  onChange,
}: UseRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  const handlePayload = useCallback((payload: any) => {
    const eventType = payload.eventType;
    
    onChange?.(payload);

    switch (eventType) {
      case 'INSERT':
        onInsert?.(payload);
        break;
      case 'UPDATE':
        onUpdate?.(payload);
        break;
      case 'DELETE':
        onDelete?.(payload);
        break;
    }
  }, [onChange, onInsert, onUpdate, onDelete]);

  useEffect(() => {
    const channelName = `realtime-${table}-${Date.now()}`;
    
    const subscribeOptions: any = {
      event,
      schema,
      table,
    };

    if (filter) {
      subscribeOptions.filter = filter;
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        subscribeOptions,
        handlePayload
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [table, schema, event, filter, handlePayload]);

  return channelRef.current;
}

// Hook for playing notification sounds
export function useNotificationSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Create audio element for notification sound
    audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleB4gSYPE45JgBQAolqDWuXonAA1Uk8Xdi0cANlZrirCZaCgoOGF1oKmSbz06WmeOjYBkQjc7V2ZwfHdrX1VLOjQ6QktUXWRnZ2VgW1RMQjo3NTo/Rk1UWV1fX1tXUkxFPzw7Oz5CSE1SV1tbWVVQS0ZBPjw8PT9DSE1RVVhZV1NOS0dDQD49PT9CSFFWS05LSklKS0tLSktJSEdGRURDQ0JCQkJCQ0NFRUVHSUpLTE5PUFFSUlNUVFVVVVVUVFNTUlFQUFBQT1BQUFBRUVJSUlNTU1NTVFNTU1NTU1NTU1NTU1NTUlJSUVFRUFFQUFBQUFBQUFBRUVFRUlJSUlNTU1NTU1NTU1NTUlJSUVFQUFBQT09PT09PT09PT09PT09PT09PT09PT09PT09PT09OTk5OTk5NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NCA==');
    audioRef.current.volume = 0.5;
    
    return () => {
      if (audioRef.current) {
        audioRef.current = null;
      }
    };
  }, []);

  const playSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(console.error);
    }
  }, []);

  return { playSound };
}
