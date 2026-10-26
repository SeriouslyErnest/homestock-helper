CREATE TABLE public.custom_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  day_of_month integer NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  message text NOT NULL,
  last_sent_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX custom_reminders_user_idx ON public.custom_reminders(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_reminders TO authenticated;
GRANT ALL ON public.custom_reminders TO service_role;
ALTER TABLE public.custom_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reminders read" ON public.custom_reminders FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own reminders insert" ON public.custom_reminders FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own reminders update" ON public.custom_reminders FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own reminders delete" ON public.custom_reminders FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_custom_reminder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.message := btrim(regexp_replace(NEW.message, '[\x00-\x08\x0B-\x1F\x7F\u200E\u200F\u202A-\u202E\u2066-\u2069]', '', 'g'));
  IF length(NEW.message) < 1 OR length(NEW.message) > 200 THEN
    RAISE EXCEPTION 'Reminder text must be 1–200 characters';
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtext('custom_reminders:' || NEW.user_id::text));
    IF (SELECT count(*) FROM public.custom_reminders WHERE user_id = NEW.user_id) >= 10 THEN
      RAISE EXCEPTION 'You can have up to 10 custom reminders';
    END IF;
  END IF;
  -- Users can't fake delivery state; only the scheduler (service role) sets it.
  IF auth.role() = 'authenticated' THEN
    NEW.last_sent_on := CASE WHEN TG_OP = 'UPDATE' THEN OLD.last_sent_on ELSE NULL END;
    IF TG_OP = 'UPDATE' AND NEW.day_of_month <> OLD.day_of_month THEN NEW.last_sent_on := NULL; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER custom_reminders_guard BEFORE INSERT OR UPDATE ON public.custom_reminders
FOR EACH ROW EXECUTE FUNCTION public.guard_custom_reminder();