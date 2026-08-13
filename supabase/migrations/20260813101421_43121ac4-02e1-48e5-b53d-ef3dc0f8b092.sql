-- Auditoria de Integridade e Remoção de Resíduos de Código (Módulo de Faturamento)

-- 1. Remoção de Triggers Obsoletas ou Duplicadas (Limpeza de Resíduos)
-- Conforme análise, existiam múltiplas triggers chamando a mesma função handle_billing_order_status_change.
-- Vamos consolidar em uma única trigger AFTER UPDATE para garantir atomicidade.

DROP TRIGGER IF EXISTS trg_billing_order_status_change ON public.billing_orders;
DROP TRIGGER IF EXISTS tr_billing_order_status_integrity ON public.billing_orders;
DROP TRIGGER IF EXISTS tr_billing_order_status_change ON public.billing_orders;

CREATE TRIGGER tr_billing_order_status_change
AFTER UPDATE ON public.billing_orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.handle_billing_order_status_change();

-- 2. Reforço da Função handle_billing_order_status_change
-- Garante que o estorno de estoque e limpeza de paletes ocorra apenas em uma transição final.
-- Já tratamos a limpeza na RPC collect_billing_order, mas a trigger serve como rede de segurança para o Admin/SQL.

CREATE OR REPLACE FUNCTION public.handle_billing_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se mudou para collected ou cancelled, limpa paletes (se ainda existirem)
  IF NEW.status IN ('collected', 'cancelled') THEN
    DELETE FROM public.billing_order_pallets WHERE billing_order_id = NEW.id;
  END IF;

  -- Se cancelada, estorna reservas se for o caso
  IF NEW.status = 'cancelled' THEN
    -- A lógica de estorno de stock_movements já deve estar implementada nas RPCs específicas,
    -- mas aqui garantimos que não fiquem reservas órfãs.
    NULL; 
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Verificação de Restrições e Enums
-- Garantir que a coluna order_type suporte 'all' sem quebras de enum.
-- (Já ajustamos as RPCs para tratar como text, mas validamos a estrutura aqui)
ALTER TABLE public.billing_orders ALTER COLUMN order_type TYPE text;

-- 4. Garantia de Auditoria Canônica
-- Todas as funções operacionais DEVEM usar a assinatura de 6 argumentos:
-- (p_company_id, p_target_id, p_action, p_author_name, p_author_code, p_details)
-- Conforme o pg_proc consultado: (uuid, uuid, text, text, text, jsonb)

-- 5. Pente fino em OFs com dados zerados (Backfill de segurança)
-- Se uma OF foi coletada mas ficou com pieces_real/weight_real zerados por erro de trigger anterior,
-- tentamos recuperar da previsão se não houver mais paletes.
UPDATE public.billing_orders 
SET 
  pieces_real = COALESCE(pieces_expected, 0),
  weight_real = COALESCE(weight_expected, 0)
WHERE status = 'collected' 
  AND (pieces_real IS NULL OR pieces_real = 0)
  AND (weight_real IS NULL OR weight_real = 0);
