
CREATE OR REPLACE FUNCTION public.save_own_stock_movement(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_company uuid := NULLIF(p_payload->>'company_id','')::uuid;
  v_article uuid := NULLIF(p_payload->>'own_article_id','')::uuid;
  v_article_name text := NULLIF(p_payload->>'article_name','');
  v_type text := p_payload->>'type';
  v_pieces int := COALESCE((p_payload->>'pieces')::int, 0);
  v_weight numeric := COALESCE((p_payload->>'weight_kg')::numeric, 0);
  v_reason text := NULLIF(p_payload->>'reason','');
  v_created_by uuid := NULLIF(p_payload->>'created_by','')::uuid;
  v_source text := NULLIF(p_payload->>'source','');
  v_out_id uuid := NULLIF(p_payload->>'outsource_company_id','')::uuid;
  v_yarn text := NULLIF(p_payload->>'yarn_type','');
  v_of text := NULLIF(p_payload->>'of_number','');
  v_id uuid;
BEGIN
  IF v_caller IS NULL OR v_company IS NULL OR v_company <> v_caller THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF v_type NOT IN ('in','out') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;

  -- Se veio article_name (novo fluxo: seleção a partir de Clientes & Artigos),
  -- localiza/cria o own_stock_articles correspondente por nome.
  IF v_article IS NULL AND v_article_name IS NOT NULL THEN
    SELECT id INTO v_article
      FROM public.own_stock_articles
     WHERE company_id = v_company AND lower(name) = lower(v_article_name)
     LIMIT 1;
    IF v_article IS NULL THEN
      INSERT INTO public.own_stock_articles (company_id, name, created_by)
      VALUES (v_company, v_article_name, v_created_by)
      RETURNING id INTO v_article;
    END IF;
  END IF;

  IF v_article IS NULL THEN RAISE EXCEPTION 'Artigo obrigatório'; END IF;
  IF v_weight <= 0 AND v_pieces <= 0 THEN RAISE EXCEPTION 'Informe peças ou peso'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.own_stock_articles WHERE id = v_article AND company_id = v_company) THEN
    RAISE EXCEPTION 'Artigo não pertence à empresa';
  END IF;

  IF v_type = 'out' THEN
    v_source := NULL; v_out_id := NULL; v_yarn := NULL; v_of := NULL;
  ELSE
    IF v_source IS NULL OR v_source NOT IN ('internal','outsource') THEN
      v_source := 'internal';
    END IF;
    IF v_source = 'internal' THEN v_out_id := NULL; END IF;
    IF v_source = 'outsource' AND v_out_id IS NULL THEN
      RAISE EXCEPTION 'Selecione a malharia terceirizada';
    END IF;
    IF v_out_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.outsource_companies WHERE id = v_out_id AND company_id = v_company
    ) THEN
      RAISE EXCEPTION 'Malharia não pertence à empresa';
    END IF;
  END IF;

  INSERT INTO public.own_stock_movements
    (company_id, own_article_id, type, pieces, weight_kg, reason, created_by,
     source, outsource_company_id, yarn_type, of_number)
  VALUES
    (v_company, v_article, v_type, v_pieces, v_weight, v_reason, v_created_by,
     v_source, v_out_id, v_yarn, v_of)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'action', 'insert');
END;
$function$;
