-- Program materials budget category (21 Oct 2026). Own migration: ALTER TYPE
-- ADD VALUE stays out of a transaction with other DDL.
ALTER TYPE "BudgetItemCategory" ADD VALUE IF NOT EXISTS 'program_materials';
