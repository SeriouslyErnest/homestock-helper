REVOKE EXECUTE ON FUNCTION public.effective_tier(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_access() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.redeem_promo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_promo(text) TO authenticated;
REVOKE ALL ON TABLE public.limit_requests FROM anon;
