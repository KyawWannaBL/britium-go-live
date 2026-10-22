# Merchant, workforce and registration management

Authorized users manage master records from these screens:

| Record | Screen | Actions |
| --- | --- | --- |
| Merchant | Marketing Portal → Merchant Master | Add, edit, deactivate; administrator Login access |
| Rider | Rider Management | Add, edit, deactivate, restore; administrator Login access |
| Driver / helper | Driver Management → Drivers / Helpers | Add, edit, deactivate, restore; administrator Login access |
| Operations employee | Admin / HR → Employee Master | Add Employee, edit, deactivate; administrator Login access |
| Login | Accounts or an existing master's Login access panel | Create linked login, edit contact details, reset password, block, remove or restore access |
| Registration | Data Entry → open parcel | Edit and Save Changes; Delete unpublished registration with a reason |

Codes identify records and cannot be renamed through an existing record's editor. Creating a duplicate code produces an error instead of overwriting another record. Shared phone numbers are allowed; identity is never inferred from phone alone.

Save a master record before creating its login. Rider, driver and helper logins link directly to their respective workforce master; an HR record is not required. Login administration requires an administrator, and employee roles must exist in the active authority matrix. Existing permissions are retained.

Deactivation preserves operational and financial history. It removes workforce availability for new assignments and disables explicitly linked login records. Restoring master availability does not automatically unblock a separately suspended login; use Login access → Restore login after reviewing the active master.

Data Entry allows corrections before waybill publication. Recalculate changed charges and save before generating the waybill. Published/printed waybills are locked. Unpublished deletion requires current data, a reason and existing Data Entry delete authority. It refuses records with warehouse, delivery, journal, collection, settlement, support or other shipment-linked activity. Pickup evidence remains available. A private recovery snapshot and audit event identify each removed registration; recovery is an administrator operation.

Verification uses isolated component, endpoint and database fixtures. No actual production users or parcels are created or deleted for tests. An authenticated live-browser check requires an administrator session.
