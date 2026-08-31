-- Add 'website' to LeadSource so school leads captured from the marketing site
-- (the "Book a call" / partner funnel) are attributable in the CRM pipeline.
ALTER TYPE "LeadSource" ADD VALUE IF NOT EXISTS 'website';
