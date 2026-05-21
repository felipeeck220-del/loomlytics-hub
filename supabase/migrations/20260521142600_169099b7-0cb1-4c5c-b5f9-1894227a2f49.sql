-- Adicionar coluna freteiro à tabela outsource_freights
ALTER TABLE public.outsource_freights 
ADD COLUMN IF NOT EXISTS freteiro TEXT;

-- Comentário na coluna para documentação
COMMENT ON COLUMN public.outsource_freights.freteiro IS 'Nome do freteiro/transportador responsável pelo frete.';