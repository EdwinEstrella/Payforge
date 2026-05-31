ALTER TABLE public.payment_links
ADD COLUMN IF NOT EXISTS short_code text,
ADD COLUMN IF NOT EXISTS stripe_url text;

UPDATE public.payment_links
SET stripe_url = CASE
  WHEN position('||' in url) > 0 THEN split_part(url, '||', 2)
  ELSE url
END
WHERE stripe_url IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_links_short_code_key
ON public.payment_links (short_code)
WHERE short_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_links_short_code_idx
ON public.payment_links (short_code);
