
UPDATE public.machine_logs
SET started_at = '2026-06-06 11:00:00+00',
    ended_at   = '2026-06-06 21:06:00+00'
WHERE id = 'f9c2362e-9a01-469d-a9a7-d0b23fa2ff30';

DELETE FROM public.machine_logs
WHERE id IN (
  'bf74c1e0-15cc-429c-bd57-6ba2d9b07499',
  '5d3afb18-eaf5-4134-829c-3a2571287a87',
  '49d84399-408a-428b-9e1d-3d52a5c12d6f',
  '735b201c-44e2-4a24-9c49-85c35c16ccaf',
  '9124847b-843a-4dc5-93c9-156fd0e5afc4',
  'e9335302-ec19-4dfa-bc5e-1ed3125bbe0c'
);
