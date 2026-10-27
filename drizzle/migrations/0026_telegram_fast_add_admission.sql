-- Server-only atomic Telegram limits. Sorted locks prevent concurrent quota bypass.
CREATE OR REPLACE FUNCTION public.telegram_take_limits(_subjects uuid[], _buckets text[])
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE i integer; k record; cap integer; seconds integer;
BEGIN
  IF cardinality(_subjects) IS NULL OR cardinality(_subjects) <> cardinality(_buckets)
     OR cardinality(_subjects) < 1 OR cardinality(_subjects) > 4 THEN
    RAISE EXCEPTION 'Invalid limits';
  END IF;
  FOR i IN 1..cardinality(_subjects) LOOP
    IF _subjects[i] IS NULL OR _buckets[i] IS NULL OR _buckets[i] NOT IN
      ('tg_chat_min','tg_chat_hour','tg_cmd','tg_cmd_hour','tg_link_try','tg_add_day') THEN
      RAISE EXCEPTION 'Invalid limit bucket';
    END IF;
  END LOOP;
  FOR k IN SELECT DISTINCT s, b FROM unnest(_subjects, _buckets) AS t(s,b) ORDER BY s,b LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('telegram-limit:' || k.s::text || ':' || k.b, 0));
  END LOOP;
  FOR i IN 1..cardinality(_subjects) LOOP
    cap := CASE _buckets[i] WHEN 'tg_chat_min' THEN 40 WHEN 'tg_chat_hour' THEN 300
      WHEN 'tg_cmd' THEN 30 WHEN 'tg_cmd_hour' THEN 300 WHEN 'tg_link_try' THEN 5 WHEN 'tg_add_day' THEN 60 END;
    seconds := CASE _buckets[i] WHEN 'tg_chat_min' THEN 60 WHEN 'tg_chat_hour' THEN 3600
      WHEN 'tg_cmd' THEN 60 WHEN 'tg_cmd_hour' THEN 3600 WHEN 'tg_link_try' THEN 900 WHEN 'tg_add_day' THEN 86400 END;
    IF (SELECT count(*) FROM public.rate_limit_hits WHERE user_id = _subjects[i]
      AND bucket = _buckets[i] AND created_at > clock_timestamp() - make_interval(secs => seconds)) >= cap THEN
      RETURN false;
    END IF;
    INSERT INTO public.rate_limit_hits(user_id,bucket) VALUES (_subjects[i],_buckets[i]);
  END LOOP;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.telegram_take_limits(uuid[],text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_take_limits(uuid[],text[]) TO service_role;

-- One transaction prepares the prompt; settings and memberships are never cached.
CREATE OR REPLACE FUNCTION public.telegram_prepare_add(_chat bigint, _chat_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE first_user uuid; homes jsonb; chosen record; selected_user uuid; selected_home uuid;
BEGIN
  IF NOT public.telegram_take_limits(ARRAY[_chat_key,_chat_key], ARRAY['tg_chat_min','tg_chat_hour']) THEN
    RETURN jsonb_build_object('status','chat_throttled');
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'telegram_commands_enabled' AND value->>'enabled' = 'false') THEN
    RETURN jsonb_build_object('status','paused');
  END IF;
  SELECT user_id INTO first_user FROM public.telegram_links WHERE chat_id = _chat AND active ORDER BY linked_at,user_id LIMIT 1;
  IF first_user IS NULL THEN RETURN jsonb_build_object('status','unlinked'); END IF;
  IF NOT public.telegram_take_limits(ARRAY[first_user,first_user], ARRAY['tg_cmd','tg_cmd_hour']) THEN
    RETURN jsonb_build_object('status','user_throttled');
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('householdId',h.household_id,'userId',h.user_id,'name',h.name) ORDER BY h.name),'[]'::jsonb)
  INTO homes FROM (
    SELECT DISTINCT ON (m.household_id) m.household_id,m.user_id,h.name
    FROM public.telegram_links l JOIN public.household_members m ON m.user_id=l.user_id
    JOIN public.households h ON h.id=m.household_id
    WHERE l.chat_id=_chat AND l.active ORDER BY m.household_id,l.linked_at,l.user_id
  ) h;
  SELECT c.user_id,c.household_id INTO selected_user,selected_home FROM public.telegram_chat_context c
    JOIN public.telegram_links l ON l.user_id=c.user_id AND l.chat_id=c.chat_id AND l.active
    JOIN public.household_members m ON m.user_id=c.user_id AND m.household_id=c.household_id
    WHERE c.chat_id=_chat;
  IF selected_home IS NULL THEN
    DELETE FROM public.telegram_chat_context WHERE chat_id=_chat;
    IF jsonb_array_length(homes)=1 THEN
      selected_user := (homes->0->>'userId')::uuid;
      selected_home := (homes->0->>'householdId')::uuid;
      INSERT INTO public.telegram_chat_context(chat_id,user_id,household_id) VALUES (_chat,selected_user,selected_home)
        ON CONFLICT(chat_id) DO UPDATE SET user_id=excluded.user_id,household_id=excluded.household_id,updated_at=now();
    END IF;
  END IF;
  IF selected_home IS NULL THEN
    DELETE FROM public.telegram_chat_state WHERE chat_id=_chat;
    RETURN jsonb_build_object('status','no_home','homes',homes);
  END IF;
  INSERT INTO public.telegram_chat_state(chat_id,awaiting,expires_at) VALUES (_chat,'add',clock_timestamp()+interval '10 minutes')
    ON CONFLICT(chat_id) DO UPDATE SET awaiting=excluded.awaiting,expires_at=excluded.expires_at;
  RETURN jsonb_build_object('status','prompt');
END $$;
REVOKE ALL ON FUNCTION public.telegram_prepare_add(bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_prepare_add(bigint,uuid) TO service_role;