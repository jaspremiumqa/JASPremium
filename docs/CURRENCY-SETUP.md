# Currency display

The website reads display currency and currency labels from
`public.application_settings`.

The local fallback file is:
Supabase `application_settings`

Expected values:

- `displayCurrency: "USD"` -> English displays `$25`.
- `displayCurrency: "QAR"` -> English displays `QAR` and Arabic displays `ريال`.

Currency labels are language-aware:
- English USD: `$`
- English QAR: `QAR`
- Arabic QAR: `ريال`

The public service catalogue is read from Supabase:
`service_categories` + `services`.

The service catalogue is owned by Supabase `service_categories` and `services`. Currency defaults and labels are owned by Supabase `application_settings`.
