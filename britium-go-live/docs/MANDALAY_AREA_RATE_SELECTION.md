# Mandalay area rate selection

The owner approved the uploaded Mandalay rates, excluded အုန်းချော, and delegated handling of missing sub-area boundaries. The operational choice is explicit selection of a labelled area and price. No street polygons, near/far definitions or lowest-price defaults are inferred.

In Data Entry, search the destination name or its MDY code and choose the entry showing the agreed amount. For example, the two ရေတံခွန်တောင် prices are separate `MDY-M01-A1` / 7,000 MMK and `MDY-M01-A2` / 8,000 MMK entries. Staff must confirm the recipient's area against the approved rate card. Enter the full delivery address and use the normal location/map process. The selected label remains on the parcel for review.

There are 56 explicit destination/rate choices, each with Standard, Royal and Commitment pricing. Base fees are identical across tiers. Standard includes 3 kg, then cumulative 500 / 700 / 1,000 / 1,500 MMK bands. Royal and Commitment include 5 kg, then 500 MMK for each started extra kg. This synchronizes tariff entitlement; merchant-declared charges and exact-collection payment rules continue to apply.

The existing DK/Mandalay provider workflow remains. Existing township fallbacks remain and do not automatically choose a new area price. Bare place-name input does not select between paired prices. No existing parcel is repriced. A future geographic matcher requires verified address rules and is separate from this release.

Database sources are synchronized to `tariff_master`, the Data Entry tariff catalog, canonical tariff aliases, `be_parcel_tariffs_v2`, and `be_delivery_tariff_master`. The seed importer preserves the uploaded source hash. Migration replay and explicit code matching are tested. Production validation checks provider, region, map mode, exact fee, tier allowance and weight boundaries.
