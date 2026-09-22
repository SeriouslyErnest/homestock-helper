CREATE TABLE public.inventory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  user_id uuid,
  kind text NOT NULL CHECK (kind IN ('consume','restock','correction')),
  delta numeric NOT NULL DEFAULT 0,
  previous_quantity numeric,
  new_quantity numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inventory_events_household_created_idx ON public.inventory_events (household_id, created_at DESC);
CREATE INDEX inventory_events_item_idx ON public.inventory_events (item_id);

GRANT SELECT, INSERT ON public.inventory_events TO authenticated;
GRANT ALL ON public.inventory_events TO service_role;

ALTER TABLE public.inventory_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view household activity"
  ON public.inventory_events FOR SELECT TO authenticated
  USING (private.is_household_member(household_id));

CREATE POLICY "Members can record household activity"
  ON public.inventory_events FOR INSERT TO authenticated
  WITH CHECK (private.is_household_member(household_id));

CREATE OR REPLACE FUNCTION public.adjust_item_quantity(_item_id uuid, _delta numeric)
RETURNS numeric
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  prev numeric;
  hid uuid;
  nextq numeric;
BEGIN
  SELECT quantity, household_id INTO prev, hid FROM public.items WHERE id = _item_id;
  IF prev IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.items
     SET quantity = GREATEST(0, quantity + _delta),
         updated_at = now()
   WHERE id = _item_id
  RETURNING quantity INTO nextq;

  IF nextq IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.inventory_events
    (household_id, item_id, user_id, kind, delta, previous_quantity, new_quantity)
  VALUES
    (hid, _item_id, auth.uid(),
     CASE WHEN _delta < 0 THEN 'consume' ELSE 'restock' END,
     nextq - prev, prev, nextq);

  RETURN nextq;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_item_quantity(_item_id uuid, _quantity numeric, _note text DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  prev numeric;
  hid uuid;
  nextq numeric;
BEGIN
  IF _quantity IS NULL OR _quantity < 0 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  SELECT quantity, household_id INTO prev, hid FROM public.items WHERE id = _item_id;
  IF prev IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.items
     SET quantity = _quantity,
         updated_at = now()
   WHERE id = _item_id
  RETURNING quantity INTO nextq;

  IF nextq IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.inventory_events
    (household_id, item_id, user_id, kind, delta, previous_quantity, new_quantity, note)
  VALUES
    (hid, _item_id, auth.uid(), 'correction', nextq - prev, prev, nextq, NULLIF(btrim(coalesce(_note, '')), ''));

  RETURN nextq;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_item_quantity(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_item_quantity(uuid, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION public.adjust_item_quantity(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_item_quantity(uuid, numeric) TO authenticated;
REVOKE ALL ON public.inventory_events FROM anon;