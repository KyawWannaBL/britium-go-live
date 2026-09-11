import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { useDispatchStore } from '../stores/dispatchStore'

let channel: RealtimeChannel | null = null

export function subscribeToDispatchUpdates() {
  if (channel) {
    return () => unsubscribeFromDispatchUpdates()
  }

  channel = supabase
    .channel('dispatch:operations')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'deliveries',
      },
      (payload) => {
        useDispatchStore
          .getState()
          .upsertDelivery(payload.new)
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'manifests',
      },
      (payload) => {
        useDispatchStore
          .getState()
          .upsertManifest(payload.new)
      },
    )
    .subscribe((status, error) => {
      useDispatchStore
        .getState()
        .setRealtimeConnected(status === 'SUBSCRIBED')

      if (error) {
        console.error('Realtime error:', error)
      }
    })

  return () => unsubscribeFromDispatchUpdates()
}

async function unsubscribeFromDispatchUpdates() {
  const activeChannel = channel
  channel = null

  if (activeChannel) {
    await supabase.removeChannel(activeChannel)
  }
}