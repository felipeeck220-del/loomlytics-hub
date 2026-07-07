
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('OM','OC','OT','OFR')),
  ref_id uuid,
  ref_number text,
  title text NOT NULL,
  body text,
  url text,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_unread_idx ON public.notifications (user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX notifications_user_created_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_company_idx ON public.notifications (company_id);
CREATE INDEX notifications_source_ref_idx ON public.notifications (user_id, source, ref_id) WHERE read_at IS NULL;

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER notifications_set_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
