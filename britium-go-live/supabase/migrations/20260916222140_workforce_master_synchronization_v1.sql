-- Workforce Master Synchronization V1
-- Non destructive: preserve IDs and historical assignments.

begin;

-- Normalize helpers to approved active roster.
insert into public.be_master_helpers
(helper_id, helper_code, helper_name, name, phone_primary, phone, branch_code, employment_type, status)
values
('HLP001','HLP001','Moe Satt Zin Tun','Moe Satt Zin Tun','09-975 135 311','09-975 135 311','YGN','Permanent','active'),
('HLP002','HLP002','Paing Zay Htut','Paing Zay Htut','09-750 629 255','09-750 629 255','YGN','Permanent','active'),
('HLP003','HLP003','Kyaw Zin Htet','Kyaw Zin Htet','09-693 057 638','09-693 057 638','YGN','Contract','active'),
('HLP004','HLP004','Aung Chan Myae','Aung Chan Myae','09-979 796 688','09-979 796 688','YGN','Contract','active'),
('HLP005','HLP005','Myint Myat Thu','Myint Myat Thu','09-798 775 120','09-798 775 120','YGN','Contract','active'),
('HLP006','HLP006','Aye Chan Soe','Aye Chan Soe',null,null,'YGN','Contract','active'),
('HLP007','HLP007','Myo Pa Pa Aung','Myo Pa Pa Aung',null,null,'YGN','Contract','active'),
('HLP008','HLP008','Phyo Phyo San','Phyo Phyo San',null,null,'YGN','Contract','active'),
('HLP009','HLP009','Bo Bo Kyaw','Bo Bo Kyaw',null,null,'YGN','Contract','active'),
('HLP010','HLP010','Nawng Lat Mahkaw','Nawng Lat Mahkaw',null,null,'YGN','Contract','active'),
('HLP011','HLP011','Phyo Ko Ko','Phyo Ko Ko',null,null,'YGN','Contract','active')
on conflict (helper_id) do update set
helper_code=excluded.helper_code,
helper_name=excluded.helper_name,
name=excluded.name,
phone_primary=excluded.phone_primary,
phone=excluded.phone,
branch_code=excluded.branch_code,
employment_type=excluded.employment_type,
status=excluded.status,
updated_at=now();

update public.be_master_helpers
set status='legacy', updated_at=now()
where helper_id not in ('HLP001','HLP002','HLP003','HLP004','HLP005','HLP006','HLP007','HLP008','HLP009','HLP010','HLP011')
and lower(status)='active';

-- Correct driver profiles while preserving driver IDs/codes.
update public.be_master_drivers set
 driver_name='zaw min htike', name='zaw min htike', phone_primary='09-778740993', phone='09-778740993', license_no='B/05214/18', updated_at=now()
where driver_code='DRV001';

update public.be_master_drivers set
 driver_name='myo thu', name='myo thu', phone_primary='09-450227237', phone='09-450227237', updated_at=now()
where driver_code='DRV003';

update public.be_master_drivers set
 driver_name='wai phyo lwin', name='wai phyo lwin', phone_primary='09-260 741 691', phone='09-260 741 691', license_no='D/00138/12', updated_at=now()
where driver_code='DRV004';

update public.be_master_drivers set
 driver_name='win naing tun', name='win naing tun', phone_primary='09-679 874 786', phone='09-679 874 786', license_no='B/19817/22', updated_at=now()
where driver_code='DRV005';

update public.be_master_drivers set
 driver_name='kyaw zaw hein', name='kyaw zaw hein', phone_primary='09-757 052 761', phone='09-757 052 761', license_no='B/08656/19', updated_at=now()
where driver_code='DRV006';

update public.be_master_drivers set
 driver_name='kyaw swar hein', name='kyaw swar hein', updated_at=now()
where driver_code='DRV007';

update public.be_master_drivers set
 driver_name='wai yan ko ko', name='wai yan ko ko', updated_at=now()
where driver_code='DRV008';

update public.be_master_drivers set
 driver_name='myo aung', name='myo aung', updated_at=now()
where driver_code='DRV009';

insert into public.be_master_drivers
(driver_id, driver_code, driver_name, name, phone_primary, phone, branch_code, status)
values
('DRV010','DRV010','kyaw zin latt','kyaw zin latt',null,null,'YGN','active')
on conflict (driver_id) do update set
 driver_code=excluded.driver_code,
 driver_name=excluded.driver_name,
 name=excluded.name,
 status=excluded.status,
 updated_at=now();

commit;