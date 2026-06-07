-- Migration: add extended product columns for ProductDetailModal
-- Phase: 2.0C+ — product master data extension

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS operational_function TEXT,
  ADD COLUMN IF NOT EXISTS uom                  TEXT,
  ADD COLUMN IF NOT EXISTS unit_cost            NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS weight               TEXT,
  ADD COLUMN IF NOT EXISTS dimensions           TEXT,
  ADD COLUMN IF NOT EXISTS packaging            TEXT,
  ADD COLUMN IF NOT EXISTS min_order_qty        TEXT,
  ADD COLUMN IF NOT EXISTS cogs_account         TEXT,
  ADD COLUMN IF NOT EXISTS revenue_account      TEXT;
