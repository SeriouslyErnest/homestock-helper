CREATE OR REPLACE FUNCTION public.adjust_item_quantity(_item_id uuid, _delta numeric)
RETURNS numeric
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  UPDATE public.items
     SET quantity = GREATEST(0, quantity + _delta),
         updated_at = now()
   WHERE id = _item_id
  RETURNING quantity;
$$;

REVOKE ALL ON FUNCTION public.adjust_item_quantity(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_item_quantity(uuid, numeric) TO authenticated;