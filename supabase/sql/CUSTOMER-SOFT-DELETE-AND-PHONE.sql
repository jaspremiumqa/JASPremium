-- Customer CRM safety and data-retention rules
-- 1) Customers are soft-deleted so booking history remains intact.
-- 2) CRM list queries should only expose active (not deleted) customers.
-- 3) Deletion is permission-controlled through a security-definer RPC.

alter table public.customers
  add column if not exists is_deleted boolean not null default false;

create or replace function public.crm_delete_customer(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.crm_has_permission('customers','delete') then
    raise exception 'Not authorized to delete customers';
  end if;

  update public.customers
  set is_deleted = true
  where id = p_id
    and is_deleted = false;

  if not found then
    raise exception 'Customer not found';
  end if;

  return jsonb_build_object('id', p_id, 'is_deleted', true);
end;
$$;

revoke all on function public.crm_delete_customer(bigint) from public;
grant execute on function public.crm_delete_customer(bigint) to authenticated;

-- Existing customers remain visible; only future deletes are soft deletes.
-- Phone validation is enforced in the CRM UI. If you want database-level
-- enforcement as well, this constraint permits an optional leading + followed
-- only by digits and allows NULL/empty values.
alter table public.customers
  drop constraint if exists customers_phone_format_check;

alter table public.customers
  add constraint customers_phone_format_check
  check (
    phone is null
    or phone = ''
    or phone ~ '^\\+[0-9]+$'
    or phone ~ '^[0-9]+$'
  );
