ALTER TABLE public.billing_orders ADD COLUMN IF NOT EXISTS collect_photos jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE POLICY "of-photos tenant read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'of-photos' AND (storage.foldername(name))[1] = (public.get_user_company_id())::text);

CREATE POLICY "of-photos tenant insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'of-photos' AND (storage.foldername(name))[1] = (public.get_user_company_id())::text);

CREATE POLICY "of-photos tenant update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'of-photos' AND (storage.foldername(name))[1] = (public.get_user_company_id())::text);

CREATE POLICY "of-photos tenant delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'of-photos' AND (storage.foldername(name))[1] = (public.get_user_company_id())::text);