
ALTER TABLE public.accounts_payable
ADD COLUMN notification_status text NOT NULL DEFAULT 'pendente',
ADD COLUMN notification_error text NULL;
