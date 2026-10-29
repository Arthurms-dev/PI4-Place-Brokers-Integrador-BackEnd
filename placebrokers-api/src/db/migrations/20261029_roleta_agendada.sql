-- Place Brokers PI4: a roleta distribui sozinha, sem depender da tela da recepção aberta.
-- Roda a cada 2 minutos, de segunda a sábado, das 09h às 17h58 de Recife (12h–20h58 UTC; Recife não tem horário de verão).
-- Fora disso os leads vão se juntando e saem na roleta do próximo dia, a partir das 09h.
-- A função roleta_distribuir já confere horário, domingo e se a lista do dia fechou; o agendamento só a chama.
-- Requer a extensão pg_cron (disponível no Supabase). Rodar de novo apenas atualiza o mesmo agendamento.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'roleta-distribuir',
  '*/2 12-20 * * 1-6',
  $$SELECT public.roleta_distribuir();$$
);

-- Para desligar: SELECT cron.unschedule('roleta-distribuir');
