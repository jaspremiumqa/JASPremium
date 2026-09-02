-- JAS Premium: repair Finance Statement Mapping
-- Run once in Supabase SQL Editor after FINANCE-AREA-SETUP.sql.
begin;

alter table public.financial_statement_mappings
  drop constraint if exists financial_statement_mappings_statement_check;
alter table public.financial_statement_mappings
  add constraint financial_statement_mappings_statement_check
  check(statement in ('Balance Sheet','Profit & Loss','Cash Flow','Statement of Changes in Equity','Trial Balance'));

with source as (
  select distinct f.statement,f.account_code,
         coalesce(nullif(f.classification_line,''),f.account_name) section_line,
         coalesce(f.active,true) active
  from public.financial_statements f
  where f.account_code is not null
),
expanded as (
  select s.statement,c.account_code,s.section_line,s.active,1 priority
  from source s join public.chart_of_accounts c on c.account_code=s.account_code
  where s.account_code ~ '^[0-9]+$'
  union all
  select s.statement,c.account_code,s.section_line,s.active,2
  from source s join public.chart_of_accounts c
    on c.account_code ~ '^[0-9]+$'
   and s.account_code ~ '^[0-9]+-[0-9]+$'
   and c.account_code::int between split_part(s.account_code,'-',1)::int
                              and split_part(s.account_code,'-',2)::int
  union all
  select s.statement,trim(x.code),s.section_line,s.active,1
  from source s
  cross join lateral regexp_split_to_table(s.account_code,'\s*,\s*') x(code)
  join public.chart_of_accounts c on c.account_code=trim(x.code)
  where s.account_code ~ ','
),
deduped as (
  select distinct on(statement,account_code)
         statement,account_code,section_line,active
  from expanded
  where statement <> 'Trial Balance'
  order by statement,account_code,priority
),
trial as (
  select 'Trial Balance' statement,c.account_code,
         coalesce(nullif(c.account_name,''),nullif(c.major_account,''),c.account_code) section_line,
         coalesce(c.active,true) active
  from public.chart_of_accounts c
  where coalesce(c.active,true)
    and coalesce(c.account_type,'') <> 'Header'
)
insert into public.financial_statement_mappings(statement,account_code,section_line,display_order,active)
select statement,account_code,section_line,
       row_number() over(partition by statement order by account_code),active
from (
  select * from deduped
  union all
  select * from trial
) m
on conflict(statement,account_code) do update
set section_line=excluded.section_line,
    display_order=excluded.display_order,
    active=excluded.active;

commit;
