
CREATE POLICY "oc-photos tenant read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'oc-photos' AND (storage.foldername(name))[1] = public.get_user_company_id()::text);

CREATE POLICY "oc-photos tenant insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'oc-photos' AND (storage.foldername(name))[1] = public.get_user_company_id()::text);

CREATE POLICY "oc-photos tenant update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'oc-photos' AND (storage.foldername(name))[1] = public.get_user_company_id()::text);

CREATE POLICY "oc-photos tenant delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'oc-photos' AND (storage.foldername(name))[1] = public.get_user_company_id()::text);
