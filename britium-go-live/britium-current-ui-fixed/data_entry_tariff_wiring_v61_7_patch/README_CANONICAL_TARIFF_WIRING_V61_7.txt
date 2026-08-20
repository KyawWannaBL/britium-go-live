Britium Express V61.7 Canonical Tariff Wiring

Cause fixed
- Data Entry calculated from public.be_parcel_tariffs_v2.
- The Tariff screen previously loaded the first available RPC/table from a separate fallback chain.
- The V61.4.1 township resolver only covered selected aliases, so an English selection such as South Okkalapa did not match a Myanmar-stored tariff row such as တောင်ဥက္ကလာပ.
- The failed lookup returned included_kg=0 and extra_per_kg=0; therefore the UI showed 10 kg - 0 kg and zero surcharge.

V61.7
- Seeds a 356-township identity crosswalk only; it does not change tariff amounts.
- Resolves township code, English, Myanmar and bilingual labels to one code.
- Keeps the verified V61.5 all-payment-type calculation engine.
- Adds be_tariff_catalog_v61_7() using be_parcel_tariffs_v2.
- Changes the Tariff screen to that same canonical RPC.
- Preserves V61.6 clean Data Entry UX.
- Keeps MUTATION_SHADOW and financial writes disabled.

Order
1. Run sql/20260803_financial_v2_canonical_tariff_wiring_v61_7.sql.
2. Run sql/verify_financial_v2_canonical_tariff_wiring_v61_7.sql.
3. Run node apply_canonical_tariff_wiring_v61_7.mjs .
4. Run node verify_canonical_tariff_wiring_v61_7.mjs .
5. npm run build
6. Run node verify_dist_canonical_tariff_wiring_v61_7.mjs .
7. npx vercel --prod
