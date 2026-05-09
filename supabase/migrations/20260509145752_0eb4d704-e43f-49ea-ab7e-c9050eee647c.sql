-- Drop the RPC function to revert to client-side processing
DROP FUNCTION IF EXISTS public.get_report_data(uuid, date, date, text, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.get_report_data(uuid, text, text, text, uuid, uuid, uuid);