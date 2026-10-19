-- EduVault Payments Database Layer Migration

-- 1. Add price column to public.materials if not exists
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS price integer NOT NULL DEFAULT 0;

-- 2. Create public.payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  tx_ref text NOT NULL UNIQUE,
  flutterwave_transaction_id text UNIQUE,
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

-- 3. Create indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_material_id ON public.payments(material_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at);

-- 4. Enable Row Level Security on public.payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for public.payments
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
CREATE POLICY "Users can view own payments"
  ON public.payments
  FOR SELECT
  USING (user_id = auth.uid());

-- Note: No INSERT, UPDATE, or DELETE policies for authenticated/anon users.
-- Server-side Edge Functions using service_role bypass RLS to create/update payment records and entitlements.

-- 6. Updated_at trigger function and trigger for payments
CREATE OR REPLACE FUNCTION public.update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
end;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_payments_updated_at ON public.payments;
CREATE TRIGGER trigger_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_payments_updated_at();
