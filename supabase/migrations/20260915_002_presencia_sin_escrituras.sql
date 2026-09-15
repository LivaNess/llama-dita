-- ============================================================
-- Llama-dita · 002 · presencia sin escrituras en la base
-- Aplicado el 2026-09-15. La presencia (conectado/ausente) pasa a Realtime Presence
-- en el cliente. profiles deja de emitirse en vivo: con 100 usuarios, cada latido
-- se reenviaba a todos (~10.000 mensajes/minuto).
-- ============================================================
alter publication supabase_realtime drop table public.profiles;
