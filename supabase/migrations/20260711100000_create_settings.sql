CREATE TABLE IF NOT EXISTS public.settings (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users (id) NOT NULL UNIQUE,
    message_today text DEFAULT 'Hola {nombre}, te saludamos de la administración. 🏋️‍♂️ Te recordamos que hoy te toca cancelar tu mensualidad del plan {plan}. El monto es de ${monto}. ¡Te esperamos!',
    message_three_days text DEFAULT 'Hola {nombre}, te saludamos de la administración. 🏋️‍♂️ Te recordamos que te faltan 3 días por cancelar tu membresía del plan {plan}. El monto es de ${monto}. ¡Te esperamos!',
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
  ON public.settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON public.settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON public.settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
