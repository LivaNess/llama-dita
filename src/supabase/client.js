import { createClient } from '@supabase/supabase-js';

// Claves públicas del proyecto (la publishable key está pensada para ir en el cliente;
// lo que protege los datos son las políticas RLS de la base).
export const SUPABASE_URL = 'https://mwzkrahindnheuheoycv.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_SiB6rCFCoaa6O4_g0_Sc2Q_gPhbcdXL';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Implicit: el enlace del mail funciona aunque se abra en otra pestaña,
    // y el mismo enlace se puede pegar dentro de la app de escritorio.
    flowType: 'implicit'
  },
  realtime: {
    params: { eventsPerSecond: 20 } // señalización WebRTC (ICE) necesita ráfagas cortas
  }
});
