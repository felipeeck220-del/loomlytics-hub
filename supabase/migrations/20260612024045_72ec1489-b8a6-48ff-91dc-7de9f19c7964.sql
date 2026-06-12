-- Adicionar billing_orders à publicação de tempo real se ainda não estiver
BEGIN;
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND tablename = 'billing_orders'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE billing_orders;
    END IF;
  END $$;
COMMIT;
