ALTER TABLE public.payment_links
ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;

UPDATE public.payment_links
SET expires_at = created_at + interval '23 hours 55 minutes'
WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS payment_links_expires_at_idx
ON public.payment_links (expires_at);
