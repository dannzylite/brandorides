-- =====================================================================
-- BrandoRides — Document Storage Buckets
-- =====================================================================
-- Private buckets for the identity/eligibility documents collected
-- during onboarding. Files are stored at "<user_id>/<doc-name>.<ext>";
-- policies key off the first path segment matching auth.uid() so an
-- owner can only ever touch their own files. Admins get read access
-- for document review (reuses is_admin() from 001).

INSERT INTO storage.buckets (id, name, public) VALUES ('student-docs', 'student-docs', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('driver-docs', 'driver-docs', false);

-- student-docs
CREATE POLICY "student-docs owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'student-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "student-docs owner select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'student-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "student-docs owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'student-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "student-docs admin select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'student-docs' AND is_admin());

-- driver-docs
CREATE POLICY "driver-docs owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'driver-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "driver-docs owner select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'driver-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "driver-docs owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'driver-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "driver-docs admin select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'driver-docs' AND is_admin());
