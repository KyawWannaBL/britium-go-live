# Contract and Business Confirmations Required

These items are deliberately configurable or blocked. The code must not infer them.

## DK Delivery

1. Exact rule for when the additional charge is 500 MMK versus 1,000 MMK.
2. Whether weight and size surcharges can both apply or only one applies.
3. Chargeable-weight rounding and dimensional/CBM formula.
4. Redelivery, return, COD, damage, loss, and SLA charges.
5. Approved area-to-rate-band mapping.
6. Highway-bus allocation method and supporting-document requirements.

## Royal Express

1. Monthly rebate base: discounted base delivery fees, total fees excluding COD, total partner fees, or another base.
2. Whether completed-way counts exclude cancelled, returned, failed, or disputed Ways.
3. Party responsible for Royal COD service fees: Britium, merchant, or receiver.
4. Rounding rule for the 0.2% COD fee.
5. Whether partner extra-kg charges are customer-facing at the same amount or absorbed/marked up by Britium.
6. Effective date and expiry/review date of quotation Q-019-05-2026.
7. Settlement invoice, tax, and withholding treatment.

## Naypyitaw branch

1. Confirm that the 10% Head Office management fee is calculated on Naypyitaw's allocated gross 55%/45% share, not total delivery revenue.
2. Confirm shareability of extra-weight, CBM, redelivery, remote-area, and other surcharges.
3. Confirm COD remittance deadline, bank account, shortage approval authority, and late-remittance penalty.
4. Confirm prepaid recognition date and reversal treatment.

## Highway station drop-off

1. Confirm the exact Downtown station identity and accepted operational aliases.
2. Confirm whether station handling/highway transport costs are included in the customer tariff or separately recognized internally.
3. Confirm CBM formula and any station-specific size restrictions.

## Activation rule

A rate/contract row with unresolved items must use one of:

- `PENDING_CONFIRMATION`
- `RATE_PENDING`
- `INACTIVE`

and must not be used for final partner settlement.
