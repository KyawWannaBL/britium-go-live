# Branch department operations

Branch managers use the same main navigation routes as head office, with dedicated branch views. The active account registry and branch territory assignment determine access. Aye Pwint Phyu's existing Mandalay branch-manager account does not need a new login.

| Screen | Branch functions | Head-office coordination |
| --- | --- | --- |
| Marketing | Add/edit leads, contact details, expected parcels/revenue and conversion stages | Same canonical lead table; HQ sees branch badges and can search by branch code |
| Business Development | Add/edit prospects and partners, expected volumes/revenue and deal stages | Same canonical BD pipeline; HQ retains company-wide visibility |
| Customer Service | Create a case for a related canonical Way ID; read conversation, save follow-up and update case status with resolution notes | Same tickets/messages used by HQ; existing role notifications continue; case status does not deliver a parcel or settle COD |
| Admin / HR | View branch employees/workforce, edit names/phone details, upload/register/open branch HR documents, submit hiring/employment requests | Shared staff identities and HR document register; roles, account access, pay, employment status and transfers remain HQ HR responsibilities |
| Master Data | View own branch workforce/fleet references and shared operational settings; submit supported change proposals with evidence | Shared masters remain authoritative; authorized HQ staff apply approved proposals in the relevant master screen |
| Tariff | Search active canonical tariffs, tiers, base fees and weight allowances; submit rate-change proposals | Tariff approval is separate from applying a synchronized operational rate; existing Superadmin editing authority is retained |

Open Branch Office → Branch departments or use the sidebar. Search the selected module; large result sets are paged in groups of 50 and capped results are identified. Save writes to the shared backend and refreshes the current query. The UI clears stale records on errors.

HR documents are stored in the existing private hr-documents bucket under the branch and uploader identity. Branch access cannot read HQ/other branch folders. Registered evidence is protected from branch orphan-cleanup deletion. Uploaded documents are limited to 10 MB in this screen. Workforce names/phones synchronize to available linked profile/mobile/assignment records; identifiers, roles and login status do not change.

A proposal is not an applied change or payment. HQ opens Branch Admin, inspects the complete proposed change/evidence and records its review. Authorized HR, master-data or tariff users then apply accepted changes through their existing controlled screens. The branch sees the recorded review status. No historical CRM branch attribution is inferred from the creator's current posting; unclassified older records remain in HQ views.

Existing Mandalay custody, waybill reprint, warehouse/wayplan, Finance and commission controls remain in place. The van's current Yangon trip and pending Mandalay handover are unchanged.
