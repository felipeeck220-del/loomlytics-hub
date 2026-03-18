
ALTER TABLE public.company_settings
ADD COLUMN shift_manha_start text NOT NULL DEFAULT '05:00',
ADD COLUMN shift_manha_end text NOT NULL DEFAULT '13:30',
ADD COLUMN shift_tarde_start text NOT NULL DEFAULT '13:30',
ADD COLUMN shift_tarde_end text NOT NULL DEFAULT '22:00',
ADD COLUMN shift_noite_start text NOT NULL DEFAULT '22:00',
ADD COLUMN shift_noite_end text NOT NULL DEFAULT '05:00';
