CREATE OR REPLACE FUNCTION public.adjust_item_quantity(_item_id uuid, _delta numeric)
 RETURNS numeric LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE prev numeric; hid uuid; nextq numeric;
BEGIN
  SELECT quantity, household_id INTO prev, hid FROM public.items WHERE id = _item_id;
  IF prev IS NULL THEN RETURN NULL; END IF;
  UPDATE public.items
     SET quantity = GREATEST(0, quantity + _delta),
         expires_on = CASE WHEN GREATEST(0, quantity + _delta) = 0 THEN NULL ELSE expires_on END,
         updated_at = now()
   WHERE id = _item_id
  RETURNING quantity INTO nextq;
  IF nextq IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.inventory_events (household_id, item_id, user_id, kind, delta, previous_quantity, new_quantity)
  VALUES (hid, _item_id, auth.uid(), CASE WHEN _delta < 0 THEN 'consume' ELSE 'restock' END, nextq - prev, prev, nextq);
  RETURN nextq;
END; $function$;

CREATE OR REPLACE FUNCTION public.set_item_quantity(_item_id uuid, _quantity numeric, _note text DEFAULT NULL::text)
 RETURNS numeric LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE prev numeric; hid uuid; nextq numeric;
BEGIN
  IF _quantity IS NULL OR _quantity < 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  SELECT quantity, household_id INTO prev, hid FROM public.items WHERE id = _item_id;
  IF prev IS NULL THEN RETURN NULL; END IF;
  UPDATE public.items
     SET quantity = _quantity,
         expires_on = CASE WHEN _quantity = 0 THEN NULL ELSE expires_on END,
         updated_at = now()
   WHERE id = _item_id
  RETURNING quantity INTO nextq;
  IF nextq IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.inventory_events (household_id, item_id, user_id, kind, delta, previous_quantity, new_quantity, note)
  VALUES (hid, _item_id, auth.uid(), 'correction', nextq - prev, prev, nextq, NULLIF(btrim(coalesce(_note, '')), ''));
  RETURN nextq;
END; $function$;