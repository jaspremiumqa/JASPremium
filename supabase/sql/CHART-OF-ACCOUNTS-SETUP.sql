-- ============================================================
-- JAS Premium CRM - Chart of Accounts
-- Supabase source of truth
-- Generated from JAS_Premium_Ladies_Salon_Chart_of_Accounts_Qatar.xlsx
-- Run once in Supabase SQL Editor.
-- ============================================================

begin;

create table if not exists public.chart_of_accounts (
  account_code text primary key,
  major_account text,
  account_name text,
  account_type text not null,
  financial_statement text not null,
  typical_balance text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chart_of_accounts_statement_idx
  on public.chart_of_accounts (financial_statement);

create index if not exists chart_of_accounts_type_idx
  on public.chart_of_accounts (account_type);

create or replace function public.set_chart_of_accounts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists chart_of_accounts_set_updated_at on public.chart_of_accounts;
create trigger chart_of_accounts_set_updated_at
before update on public.chart_of_accounts
for each row execute function public.set_chart_of_accounts_updated_at();

alter table public.chart_of_accounts enable row level security;

-- This migration must work with the current CRM role model, which uses
-- admin_users.role_id -> crm_roles -> crm_role_permissions -> crm_permissions.
-- Older versions of the project used public.is_crm_admin(), but that function
-- is not present in the current schema. Keep the permission check here
-- self-contained so this migration does not depend on that legacy function.
create or replace function public.crm_has_permission(p_section text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    join public.crm_role_permissions rp on rp.role_id = au.role_id
    join public.crm_permissions p on p.id = rp.permission_id
    where au.user_id = auth.uid()
      and au.active = true
      and p.section = p_section
      and p.action = p_action
  );
$$;

revoke all on function public.crm_has_permission(text, text) from public;
grant execute on function public.crm_has_permission(text, text) to authenticated;

drop policy if exists "crm_chart_accounts_select" on public.chart_of_accounts;
drop policy if exists "crm_chart_accounts_insert" on public.chart_of_accounts;
drop policy if exists "crm_chart_accounts_update" on public.chart_of_accounts;
drop policy if exists "crm_chart_accounts_delete" on public.chart_of_accounts;

create policy "crm_chart_accounts_select"
on public.chart_of_accounts
for select
to authenticated
using (public.crm_has_permission('chart-of-accounts', 'read'));

create policy "crm_chart_accounts_insert"
on public.chart_of_accounts
for insert
to authenticated
with check (public.crm_has_permission('chart-of-accounts', 'create'));

create policy "crm_chart_accounts_update"
on public.chart_of_accounts
for update
to authenticated
using (public.crm_has_permission('chart-of-accounts', 'update'))
with check (public.crm_has_permission('chart-of-accounts', 'update'));

create policy "crm_chart_accounts_delete"
on public.chart_of_accounts
for delete
to authenticated
using (public.crm_has_permission('chart-of-accounts', 'delete'));

-- Seed/update the 112 accounts from the supplied workbook.
insert into public.chart_of_accounts
  (account_code, major_account, account_name, account_type, financial_statement, typical_balance, notes)
values

('1000', '', 'ASSETS', 'Header', 'Balance Sheet', '', ''),
('1100', 'Cash on Hand', '', 'Current Asset', 'Balance Sheet', 'Debit', 'Petty cash and cash float'),
('1110', '', 'Cash - Salon Cash', 'Current Asset', 'Balance Sheet', 'Debit', 'Salon cash'),
('1120', '', 'Cash - Petty Cash Sara', 'Current Asset', 'Balance Sheet', 'Debit', 'Small daily payments'),
('1200', 'Bank Accounts', '', 'Current Asset', 'Balance Sheet', 'Debit', 'Bank balances'),
('1210', '', 'CBQ Bank Account', 'Current Asset', 'Balance Sheet', 'Debit', 'Use actual bank name/account'),
('1220', '', 'Other Bank Account', 'Current Asset', 'Balance Sheet', 'Debit', 'Additional bank account'),
('1300', '', 'Accounts Receivable - Customers', 'Current Asset', 'Balance Sheet', 'Debit', 'Credit customers/corporate clients'),
('1310', '', 'Credit Card Receivables', 'Current Asset', 'Balance Sheet', 'Debit', 'Card settlements pending'),
('1320', '', 'Online Payment Receivables', 'Current Asset', 'Balance Sheet', 'Debit', 'Payment gateway balances'),
('1400', 'Inventory', '', 'Current Asset', 'Balance Sheet', 'Debit', 'Products held for sale/use'),
('1410', '', 'Hair Products Inventory', 'Current Asset', 'Balance Sheet', 'Debit', 'Shampoo, treatments, dyes, etc.'),
('1420', '', 'Beauty Consumables Inventory', 'Current Asset', 'Balance Sheet', 'Debit', 'Wax, gloves, tissues, etc.'),
('1430', '', 'Retail Products Inventory', 'Current Asset', 'Balance Sheet', 'Debit', 'Products sold to customers'),
('1500', '', 'Prepaid Expenses', 'Current Asset', 'Balance Sheet', 'Debit', 'Expenses paid in advance'),
('1510', '', 'Prepaid Rent', 'Current Asset', 'Balance Sheet', 'Debit', 'Rent paid in advance'),
('1520', '', 'Prepaid Insurance', 'Current Asset', 'Balance Sheet', 'Debit', 'Insurance paid in advance'),
('1530', '', 'Security Deposits', 'Non-current Asset', 'Balance Sheet', 'Debit', 'Rental/utility deposits'),
('1540', '', 'Post Dated Checks', 'Non-current Asset', 'Balance Sheet', 'Debit', 'Rental/utility deposits'),
('1600', '', 'Property & Equipment', 'Non-current Asset', 'Balance Sheet', 'Debit', 'Salon fixed assets'),
('1610', '', 'Leasehold Improvements', 'Non-current Asset', 'Balance Sheet', 'Debit', 'Fit-out and renovation'),
('1620', '', 'Salon Furniture & Fixtures', 'Non-current Asset', 'Balance Sheet', 'Debit', 'Chairs, mirrors, cabinets'),
('1630', '', 'Hair & Beauty Equipment', 'Non-current Asset', 'Balance Sheet', 'Debit', 'Dryers, steamers, machines, etc.'),
('1640', '', 'Computer & POS Equipment', 'Non-current Asset', 'Balance Sheet', 'Debit', 'Computer, POS, printer'),
('1650', '', 'Office Equipment', 'Non-current Asset', 'Balance Sheet', 'Debit', 'Office equipment'),
('1660', '', 'Vehicles', 'Non-current Asset', 'Balance Sheet', 'Debit', 'Only if owned by salon'),
('1690', '', 'Accumulated Depreciation', 'Contra Asset', 'Balance Sheet', 'Credit', 'Accumulated depreciation'),
('1691', '', 'Accumulated Depreciation - Leasehold Improvements', 'Contra Asset', 'Balance Sheet', 'Credit', ''),
('1692', '', 'Accumulated Depreciation - Furniture & Fixtures', 'Contra Asset', 'Balance Sheet', 'Credit', ''),
('1693', '', 'Accumulated Depreciation - Equipment', 'Contra Asset', 'Balance Sheet', 'Credit', ''),
('1694', '', 'Accumulated Depreciation - Computer/POS', 'Contra Asset', 'Balance Sheet', 'Credit', ''),
('2000', '', 'LIABILITIES', 'Header', 'Balance Sheet', '', ''),
('2100', 'Accounts Payable - Suppliers', '', 'Current Liability', 'Balance Sheet', 'Credit', 'Suppliers'' unpaid invoices'),
('2110', '', 'Accrued Expenses', 'Current Liability', 'Balance Sheet', 'Credit', 'Expenses incurred but not yet invoiced'),
('2120', '', 'Accrued Salaries & Wages', 'Current Liability', 'Balance Sheet', 'Credit', 'Unpaid payroll'),
('2130', '', 'Accrued Utilities', 'Current Liability', 'Balance Sheet', 'Credit', 'Unpaid utilities'),
('2140', '', 'Accrued Rent', 'Current Liability', 'Balance Sheet', 'Credit', 'Unpaid rent'),
('2200', '', 'Employee Benefits / Leave Payable', 'Current Liability', 'Balance Sheet', 'Credit', 'Employee-related accruals where applicable'),
('2300', '', 'Credit Card / Payment Gateway Payable', 'Current Liability', 'Balance Sheet', 'Credit', 'Settlement/charge liabilities if applicable'),
('2400', '', 'Customer Deposits / Advance Receipts', 'Current Liability', 'Balance Sheet', 'Credit', 'Customer prepaid packages/appointments'),
('2500', '', 'Other Current Liabilities', 'Current Liability', 'Balance Sheet', 'Credit', ''),
('2600', '', 'Loans & Borrowings', 'Liability', 'Balance Sheet', 'Credit', 'Bank/other financing'),
('2610', '', 'Bank Loan - Current Portion', 'Current Liability', 'Balance Sheet', 'Credit', ''),
('2620', '', 'Bank Loan - Long Term', 'Non-current Liability', 'Balance Sheet', 'Credit', ''),
('2700', '', 'Lease Liability', 'Liability', 'Balance Sheet', 'Credit', 'If IFRS 16 applies to the salon lease'),
('2710', '', 'Lease Liability - Current', 'Current Liability', 'Balance Sheet', 'Credit', ''),
('2720', '', 'Lease Liability - Non-current', 'Non-current Liability', 'Balance Sheet', 'Credit', ''),
('3000', '', 'EQUITY', 'Header', 'Balance Sheet / Equity', '', ''),
('3100', '', 'Share Capital', 'Equity', 'Balance Sheet / Equity', 'Credit', 'Issued capital'),
('3200', '', 'Additional Paid-in Capital', 'Equity', 'Balance Sheet / Equity', 'Credit', 'Owner/shareholder additional funding'),
('3300', '', 'Owner / Shareholder Current Account', 'Equity', 'Balance Sheet / Equity', 'Credit/Debit', 'Use consistently based on legal structure'),
('3400', '', 'Retained Earnings', 'Equity', 'Balance Sheet / Equity', 'Credit', 'Accumulated prior-year profit/loss'),
('3500', '', 'Current Year Profit / Loss', 'Equity', 'Balance Sheet / Equity', 'Credit/Debit', 'Closing account'),
('3600', '', 'Dividends / Drawings', 'Equity', 'Equity', 'Debit', 'Distributions to owners/shareholders'),
('4000', '', 'REVENUE', 'Header', 'Profit & Loss', '', ''),
('4100', '', 'Hair Services Revenue', 'Revenue', 'Profit & Loss', 'Credit', 'Haircuts, styling, blow-dry'),
('4110', '', 'Hair Coloring Revenue', 'Revenue', 'Profit & Loss', 'Credit', 'Dye/color services'),
('4120', '', 'Highlights / Balayage Revenue', 'Revenue', 'Profit & Loss', 'Credit', ''),
('4130', '', 'Hair Treatment Revenue', 'Revenue', 'Profit & Loss', 'Credit', ''),
('4140', '', 'Hair Extensions Revenue', 'Revenue', 'Profit & Loss', 'Credit', ''),
('4150', '', 'Bridal / VIP Hair Revenue', 'Revenue', 'Profit & Loss', 'Credit', ''),
('4200', '', 'Beauty Services Revenue', 'Revenue', 'Profit & Loss', 'Credit', 'Facial, waxing, threading, lashes, etc.'),
('4210', '', 'Waxing Revenue', 'Revenue', 'Profit & Loss', 'Credit', ''),
('4220', '', 'Eyebrow / Threading Revenue', 'Revenue', 'Profit & Loss', 'Credit', ''),
('4230', '', 'Eyelash Services Revenue', 'Revenue', 'Profit & Loss', 'Credit', ''),
('4240', '', 'Facial / Skin Services Revenue', 'Revenue', 'Profit & Loss', 'Credit', ''),
('4300', '', 'Customised Package', 'Revenue', 'Profit & Loss', 'Credit', 'Recognize according to applicable accounting treatment'),
('4310', '', 'Membership Revenue', 'Revenue', 'Profit & Loss', 'Credit', ''),
('4320', '', 'Vouchers', 'Revenue', 'Profit & Loss', 'Credit', ''),
('4400', '', 'Retail Product Sales', 'Revenue', 'Profit & Loss', 'Credit', 'Products sold to customers'),
('4500', '', 'Other Operating Revenue', 'Revenue', 'Profit & Loss', 'Credit', ''),
('4900', '', 'Sales Discounts & Allowances', 'Contra Revenue', 'Profit & Loss', 'Debit', 'Discounts/promotions'),
('5000', '', 'COST OF SALES', 'Header', 'Profit & Loss', '', ''),
('5100', '', 'Hair Product Cost of Sales', 'Cost of Sales', 'Profit & Loss', 'Debit', 'Products consumed/sold for hair services'),
('5110', '', 'Hair Color / Dye Cost', 'Cost of Sales', 'Profit & Loss', 'Debit', ''),
('5120', '', 'Hair Treatment Product Cost', 'Cost of Sales', 'Profit & Loss', 'Debit', ''),
('5130', '', 'Hair Extension Cost', 'Cost of Sales', 'Profit & Loss', 'Debit', ''),
('5200', '', 'Beauty Consumables Cost', 'Cost of Sales', 'Profit & Loss', 'Debit', 'Wax, cotton, gloves, etc.'),
('5300', '', 'Retail Product Cost of Sales', 'Cost of Sales', 'Profit & Loss', 'Debit', 'Cost of products sold'),
('5400', '', 'Packaging / Service Consumables', 'Cost of Sales', 'Profit & Loss', 'Debit', 'Bags, disposable items, etc.'),
('6000', '', 'OPERATING EXPENSES', 'Header', 'Profit & Loss', '', ''),
('6100', '', 'Expenses - Salaries & Wages', 'Operating Expense', 'Profit & Loss', 'Debit', 'Staff salaries'),
('6110', '', 'Staff Overtime', 'Operating Expense', 'Profit & Loss', 'Debit', ''),
('6120', '', 'Staff Benefits', 'Operating Expense', 'Profit & Loss', 'Debit', ''),
('6130', '', 'Recruitment / Visa / Staff Costs', 'Operating Expense', 'Profit & Loss', 'Debit', 'Allocate according to accounting policy'),
('6200', '', 'Rent Expense', 'Operating Expense', 'Profit & Loss', 'Debit', 'Salon premises rent'),
('6210', '', 'Electricity Expense', 'Operating Expense', 'Profit & Loss', 'Debit', ''),
('6220', '', 'Water Expense', 'Operating Expense', 'Profit & Loss', 'Debit', ''),
('6230', '', 'Internet & Telephone', 'Operating Expense', 'Profit & Loss', 'Debit', ''),
('6300', '', 'Repairs & Maintenance', 'Operating Expense', 'Profit & Loss', 'Debit', ''),
('6400', '', 'Cleaning Expense', 'Operating Expense', 'Profit & Loss', 'Debit', ''),
('6500', '', 'Laundry Expense', 'Operating Expense', 'Profit & Loss', 'Debit', ''),
('6600', '', 'Marketing & Advertising', 'Operating Expense', 'Profit & Loss', 'Debit', 'Instagram, ads, printing, promotions'),
('6700', '', 'Professional / Accounting Fees', 'Operating Expense', 'Profit & Loss', 'Debit', ''),
('6800', '', 'Insurance Expense', 'Operating Expense', 'Profit & Loss', 'Debit', ''),
('6900', '', 'Bank Charges & Merchant Fees', 'Operating Expense', 'Profit & Loss', 'Debit', 'Bank/card/payment fees'),
('6910', '', 'Payment Gateway Fees', 'Operating Expense', 'Profit & Loss', 'Debit', ''),
('7000', '', 'Office Supplies', 'Operating Expense', 'Profit & Loss', 'Debit', ''),
('7100', '', 'Software & POS Subscription', 'Operating Expense', 'Profit & Loss', 'Debit', ''),
('7200', '', 'Transportation / Delivery', 'Operating Expense', 'Profit & Loss', 'Debit', ''),
('7300', '', 'Depreciation Expense', 'Operating Expense', 'Profit & Loss', 'Debit', ''),
('7400', '', 'Legal & Government Fees', 'Operating Expense', 'Profit & Loss', 'Debit', ''),
('7500', '', 'Training & Staff Development', 'Operating Expense', 'Profit & Loss', 'Debit', ''),
('7600', '', 'Security / Pest Control', 'Operating Expense', 'Profit & Loss', 'Debit', ''),
('7700', '', 'Other Operating Expenses', 'Operating Expense', 'Profit & Loss', 'Debit', ''),
('8000', '', 'OTHER INCOME / EXPENSE', 'Header', 'Profit & Loss', '', ''),
('8100', '', 'Interest Income', 'Other Income', 'Profit & Loss', 'Credit', ''),
('8200', '', 'Interest Expense', 'Finance Cost', 'Profit & Loss', 'Debit', ''),
('8300', '', 'Foreign Exchange Gain', 'Other Income', 'Profit & Loss', 'Credit', 'If foreign currency transactions occur'),
('8400', '', 'Foreign Exchange Loss', 'Other Expense', 'Profit & Loss', 'Debit', ''),
('8500', '', 'Income Tax Expense', 'Tax Expense', 'Profit & Loss', 'Debit', 'If applicable'),
('8600', '', 'Gain / Loss on Disposal of Assets', 'Other Income/Expense', 'Profit & Loss', 'Credit/Debit', '')
 
on conflict (account_code) do update set
  major_account = excluded.major_account,
  account_name = excluded.account_name,
  account_type = excluded.account_type,
  financial_statement = excluded.financial_statement,
  typical_balance = excluded.typical_balance,
  notes = excluded.notes,
  active = true,
  updated_at = now();

commit;

-- Verify:
-- select count(*) from public.chart_of_accounts;
-- select account_code, account_name from public.chart_of_accounts order by account_code desc;

-- Grant the existing Chart of Accounts CRM permissions to admin roles.
insert into public.crm_permissions (section, action, description) values
  ('chart-of-accounts','read','View Chart of Accounts'),
  ('chart-of-accounts','create','Create Chart of Accounts entries'),
  ('chart-of-accounts','update','Update Chart of Accounts entries'),
  ('chart-of-accounts','delete','Delete Chart of Accounts entries')
on conflict (section, action) do nothing;

insert into public.crm_role_permissions (role_id, permission_id)
select r.id, p.id
from public.crm_roles r
cross join public.crm_permissions p
where lower(r.name) in ('admin','administrator')
  and p.section = 'chart-of-accounts'
on conflict do nothing;
