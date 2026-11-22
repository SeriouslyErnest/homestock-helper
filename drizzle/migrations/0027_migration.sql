CREATE OR REPLACE FUNCTION public.guard_membership_role_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT private.is_household_owner(OLD.household_id)
       AND coalesce(current_setting('homestock.succession', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Only an owner can change a member role';
    END IF;
  END IF;
  IF NEW.household_id IS DISTINCT FROM OLD.household_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Membership identity cannot be changed';
  END IF;
  RETURN NEW;
END;
$function$;

-- When a membership disappears: an empty home is deleted; a home left with
-- no owner hands ownership to its longest-standing remaining member.
CREATE OR REPLACE FUNCTION private.after_member_removed()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE next_user uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.households WHERE id = OLD.household_id) THEN
    RETURN NULL; -- home itself is being deleted
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('household-succession:' || OLD.household_id::text));
  IF NOT EXISTS (SELECT 1 FROM public.household_members WHERE household_id = OLD.household_id) THEN
    DELETE FROM public.households WHERE id = OLD.household_id;
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.household_members WHERE household_id = OLD.household_id AND role = 'owner') THEN
    SELECT user_id INTO next_user FROM public.household_members
     WHERE household_id = OLD.household_id ORDER BY created_at, user_id LIMIT 1;
    PERFORM set_config('homestock.succession', 'on', true);
    UPDATE public.household_members SET role = 'owner'
     WHERE household_id = OLD.household_id AND user_id = next_user;
    PERFORM set_config('homestock.succession', '', true);
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION private.after_member_removed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS member_removed_succession ON public.household_members;
CREATE TRIGGER member_removed_succession
  AFTER DELETE ON public.household_members
  FOR EACH ROW EXECUTE FUNCTION private.after_member_removed();