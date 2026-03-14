
CREATE TABLE public.article_machine_turns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  turns_per_roll INTEGER NOT NULL,
  observations TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(article_id, machine_id)
);

ALTER TABLE public.article_machine_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own article_machine_turns" ON public.article_machine_turns FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can insert own article_machine_turns" ON public.article_machine_turns FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Users can update own article_machine_turns" ON public.article_machine_turns FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can delete own article_machine_turns" ON public.article_machine_turns FOR DELETE TO authenticated USING (company_id = get_user_company_id());
