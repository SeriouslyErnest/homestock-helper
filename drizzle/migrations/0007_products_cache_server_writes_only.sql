DROP POLICY IF EXISTS "Signed-in users can add to the product cache" ON public.products;
DROP POLICY IF EXISTS "Signed-in users can refresh stale cache entries" ON public.products;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.products FROM authenticated, anon;
GRANT SELECT ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.products TO service_role;
