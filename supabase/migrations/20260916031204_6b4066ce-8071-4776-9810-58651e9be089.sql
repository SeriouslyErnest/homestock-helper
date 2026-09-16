CREATE TABLE public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Our Home',
  invite_code text NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.households TO authenticated;
GRANT ALL ON public.households TO service_role;
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.household_members (
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_members TO authenticated;
GRANT ALL ON public.household_members TO service_role;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_household_member(_household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = _household_id AND user_id = auth.uid()
  )
$$;

CREATE POLICY "Members can view their household" ON public.households
  FOR SELECT TO authenticated USING (public.is_household_member(id) OR created_by = auth.uid());
CREATE POLICY "Users can create households" ON public.households
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Owners can update households" ON public.households
  FOR UPDATE TO authenticated USING (public.is_household_member(id));

CREATE POLICY "Members can view membership" ON public.household_members
  FOR SELECT TO authenticated USING (public.is_household_member(household_id) OR user_id = auth.uid());
CREATE POLICY "Users can join households" ON public.household_members
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Members can update their own membership" ON public.household_members
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Members can leave households" ON public.household_members
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can create own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE TABLE public.products (
  barcode text PRIMARY KEY,
  name text,
  brand text,
  image_url text,
  quantity_label text,
  source text NOT NULL DEFAULT 'openfoodfacts',
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read the product cache" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed-in users can add to the product cache" ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Signed-in users can update the product cache" ON public.products FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  barcode text,
  image_url text,
  category text NOT NULL DEFAULT 'Pantry',
  location text,
  quantity numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'pcs',
  min_quantity numeric NOT NULL DEFAULT 0,
  expires_on date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view household items" ON public.items FOR SELECT TO authenticated USING (public.is_household_member(household_id));
CREATE POLICY "Members can add household items" ON public.items FOR INSERT TO authenticated WITH CHECK (public.is_household_member(household_id));
CREATE POLICY "Members can update household items" ON public.items FOR UPDATE TO authenticated USING (public.is_household_member(household_id));
CREATE POLICY "Members can delete household items" ON public.items FOR DELETE TO authenticated USING (public.is_household_member(household_id));

CREATE TABLE public.shopping_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  note text,
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  bought_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_items TO authenticated;
GRANT ALL ON public.shopping_items TO service_role;
ALTER TABLE public.shopping_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view shopping list" ON public.shopping_items FOR SELECT TO authenticated USING (public.is_household_member(household_id));
CREATE POLICY "Members can add to shopping list" ON public.shopping_items FOR INSERT TO authenticated WITH CHECK (public.is_household_member(household_id));
CREATE POLICY "Members can update shopping list" ON public.shopping_items FOR UPDATE TO authenticated USING (public.is_household_member(household_id));
CREATE POLICY "Members can delete from shopping list" ON public.shopping_items FOR DELETE TO authenticated USING (public.is_household_member(household_id));