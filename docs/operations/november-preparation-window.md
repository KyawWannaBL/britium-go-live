# November opening: advance preparation

Prepare new pickups, verify genuine collected parcels, complete Data Entry and print ready waybills on 31 October 2026. Generate, revise or cancel CREATED Wayplans for the 1 November delivery operation. Genuine pickup commission accruals may remain READY/PENDING; they are not paid or credited to wallets by this window.

The business opening stays 1 November 2026 00:00 Myanmar time. Dispatch, delivery completion, collected COD, settlement, wallet credit and payout remain blocked until that boundary. Existing role and branch authorization, canonical intake evidence, retired identifiers and the November client epoch remain enforced. Draft finance quotes, predispatch review and warehouse/shipment mirrors are allowed because registration depends on them.

The new-data floor is the completed archive's activation time. October 31 preparation is genuine production data: retain its real creation timestamps, keep it visible and editable after midnight, and do not clear it again on November 1. The shared live-row visibility cutoff uses this provenance floor; the business-opening clock remains separate.

The Financial V2 runtime singleton was incorrectly included in the transaction archive. Restore its exact typed archived ACTIVE configuration, preserve the archive copy, and exclude the setting from future transaction scopes. No historical pickup, delivery, wallet liability or settlement is restored by this correction. Exact whole-batch restoration now requires reconciliation because the policy/configuration and subsequent legitimate preparation differ from the original empty state.

Validation: root script `node scripts/test-october-preparation.mjs` covers real shared-trigger behavior, runtime configuration restoration, allowed preparation and genuine pickup commission accruals, denied early execution/collection/payout, old-client and archived-key denial, and continued visibility/editing after business opening.
