-- Add internal_notes column to reservations table
-- This field is staff-only and is never shown to customers.
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS internal_notes text;
