-- Habilita extensões necessárias
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove job antigo se existir
do $$
begin
  if exists (select 1 from cron.job where jobname = 'axis-license-daily-check') then
    perform cron.unschedule('axis-license-daily-check');
  end if;
end $$;

-- Agenda verificação diária às 06:00 (horário do servidor / UTC do Postgres)
select cron.schedule(
  'axis-license-daily-check',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://pevufhsuhbfnvstfoulq.supabase.co/functions/v1/scheduled-license-check',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnVmaHN1aGJmbnZzdGZvdWxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMjQ1OTUsImV4cCI6MjA4OTkwMDU5NX0.BFMFmaGfW5tkIxS0HbfQ0sMI6qMBxVMMxO18ih0XYlo'
    ),
    body := jsonb_build_object('source','cron','time', now()::text)
  );
  $$
);