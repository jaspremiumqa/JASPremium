-- ============================================================
-- CUSTOMER NOTES SEPARATION
--
-- Customer notes are internal CRM notes. They must NEVER be populated
-- from the public booking form's customer comment.
--
-- Public booking comments belong in bookings.customer_notes.
-- Existing customer notes are preserved. This only guarantees that a
-- newly-created customer starts with notes = NULL.
-- ============================================================

create or replace function public.crm_clear_new_customer_notes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.notes := null;
  return new;
end;
$$;

drop trigger if exists trg_crm_clear_new_customer_notes on public.customers;
create trigger trg_crm_clear_new_customer_notes
before insert on public.customers
for each row
execute function public.crm_clear_new_customer_notes();

-- The public booking RPC must continue storing the end-user's comment in
-- bookings.customer_notes. It must not use that value as customers.notes.
-- The trigger above guarantees new customer records are always created with
-- a NULL internal note even if an older booking RPC passes the comment while
-- creating the customer.
