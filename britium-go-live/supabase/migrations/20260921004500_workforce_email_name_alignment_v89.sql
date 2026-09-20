
create temporary table tmp_workforce_email_name_v89 (
  role_code text not null,
  email text not null,
  workforce_code text not null,
  display_name text not null,
  phone text,
  branch_code text not null,
  employment_type text
) on commit drop;

insert into tmp_workforce_email_name_v89
(role_code,email,workforce_code,display_name,phone,branch_code,employment_type)
values
('HELPER','helper_ygn_0001@britiumventures.com','HLP001','Moe Satt Zin Tun','09-975 135 311','YGN','Permanent'),
('HELPER','helper_ygn_0002@britiumventures.com','HLP002','Paing Zay Htut','09-750 629 255','YGN','Permanent'),
('HELPER','helper_ygn_0003@britiumventures.com','HLP003','Kyaw Zin Htet','09-693 057 638','YGN','Contract'),
('HELPER','helper_ygn_0004@britiumventures.com','HLP004','Aung Chan Myae','09-979 796 688','YGN','Contract'),
('HELPER','helper_ygn_0005@britiumventures.com','HLP005','Myint Myat Thu','09-798 775 120','YGN','Contract'),
('HELPER','helper_ygn_0006@britiumventures.com','HLP007','Myo Pa Pa Aung','09-779617044','YGN','Contract'),
('HELPER','helper_ygn_0007@britiumventures.com','HLP008','Thet Phoo Ko Ko','09-687112764','YGN','Contract'),
('HELPER','helper_ygn_0008@britiumventures.com','HLP009','Zin Min Khant','09-760337284','YGN','Contract'),
('HELPER','helper_ygn_0009@britiumventures.com','HLP0010','Aye Chan Soe','09-259 725 323','YGN','Permanent'),
('HELPER','helper_ygn_0010@britiumventures.com','HLP0011','Bo Bo Kyaw','09-786 015 602','YGN','Contract'),
('HELPER','helper_ygn_0011@britiumventures.com','HLP0012','Nawng Lat Mahkaw','09-965 023 790','YGN','Contract'),
('HELPER','helper_ygn_0012@britiumventures.com','HLP0013','Phyo Ko Ko','09-683771452','YGN','Contract'),

('RIDER','rider_ygn_0001@britiumventures.com','RID001','Paing Zay Htut','09-779 052 872','YGN','Permanent'),
('RIDER','rider_ygn_0002@britiumventures.com','RID002','Kyaw Zin Htet','09-779 615 147','YGN','Permanent'),
('RIDER','rider_ygn_0003@britiumventures.com','RID003','Aung Chan Myae','09-662 385 475','YGN','Permanent'),
('RIDER','rider_ygn_0004@britiumventures.com','RID004','Myint Myat Thu','09-779 634 710','YGN','Permanent'),
('RIDER','rider_ygn_0005@britiumventures.com','RID005','Aye Chan Soe','09-259 725 323','YGN','Permanent'),
('RIDER','rider_ygn_0006@britiumventures.com','RID006','Myo Pa Pa Aung','09-779 617 044','YGN','Permanent'),
('RIDER','rider_ygn_0007@britiumventures.com','RID007','Bo Bo Kyaw','09-786 015 602','YGN','Contract'),
('RIDER','rider_ygn_0008@britiumventures.com','RID008','Nawng Lat Mahkaw','09-965 023 790','YGN','Contract'),
('RIDER','rider_ygn_0009@britiumventures.com','RID009','Phyo Ko Ko',null,'YGN','Contract'),

('DRIVER','driver_ygn_0001@britiumventures.com','DRV001','zaw min htike','09-778740993','YGN',null),
('DRIVER','driver_ygn_0002@britiumventures.com','DRV002','myo thu','09-450227237','YGN',null),
('DRIVER','driver_ygn_0003@britiumventures.com','DRV003','wai phyo lwin','09-260 741 691','YGN',null),
('DRIVER','driver_ygn_0004@britiumventures.com','DRV004','win naing tun','09-679 874 786','YGN',null),
('DRIVER','driver_ygn_0005@britiumventures.com','DRV005','kyaw zaw hein','09-757 052 761','YGN',null),
('DRIVER','driver_ygn_0006@britiumventures.com','DRV006','kyaw swar hein',null,'YGN',null),
('DRIVER','driver_ygn_0007@britiumventures.com','DRV007','wai yan ko ko',null,'YGN',null),
('DRIVER','driver_ygn_0008@britiumventures.com','DRV008','myo aung',null,'YGN',null),
('DRIVER','driver_ygn_0009@britiumventures.com','DRV009','kyaw zin latt',null,'YGN',null);

-- Exact operational roster used by Wayplan assignment.
update public.be_wayplan_roster_allowlist_v68
set active=false, updated_at=now()
where branch_code='YGN' and role_code in ('DRIVER','RIDER','HELPER');

insert into public.be_wayplan_roster_allowlist_v68
(role_code,workforce_code,display_name,phone,branch_code,employment_type,active,source_file,updated_at)
select role_code,workforce_code,display_name,phone,branch_code,employment_type,true,
       'be_master_drivers_riders_helpers_rows1.csv',now()
from tmp_workforce_email_name_v89
on conflict (role_code,workforce_code) do update
set display_name=excluded.display_name,
    phone=excluded.phone,
    branch_code=excluded.branch_code,
    employment_type=excluded.employment_type,
    active=true,
    source_file=excluded.source_file,
    updated_at=now();

-- Role master tables.
insert into public.be_master_drivers
(driver_id,driver_code,driver_name,name,phone_primary,phone,branch_code,status,updated_at)
select workforce_code,workforce_code,display_name,display_name,phone,phone,branch_code,'active',now()
from tmp_workforce_email_name_v89 where role_code='DRIVER'
on conflict (driver_id) do update
set driver_code=excluded.driver_code,driver_name=excluded.driver_name,name=excluded.name,
    phone_primary=excluded.phone_primary,phone=excluded.phone,branch_code=excluded.branch_code,
    status='active',updated_at=now();

insert into public.be_master_riders
(rider_id,rider_code,rider_name,name,phone_primary,phone,branch_code,employment_type,status,updated_at)
select workforce_code,workforce_code,display_name,display_name,phone,phone,branch_code,employment_type,'active',now()
from tmp_workforce_email_name_v89 where role_code='RIDER'
on conflict (rider_id) do update
set rider_code=excluded.rider_code,rider_name=excluded.rider_name,name=excluded.name,
    phone_primary=excluded.phone_primary,phone=excluded.phone,branch_code=excluded.branch_code,
    employment_type=excluded.employment_type,status='active',updated_at=now();

insert into public.be_master_helpers
(helper_id,helper_code,helper_name,name,phone_primary,phone,branch_code,employment_type,status,updated_at)
select workforce_code,workforce_code,display_name,display_name,phone,phone,branch_code,employment_type,'active',now()
from tmp_workforce_email_name_v89 where role_code='HELPER'
on conflict (helper_id) do update
set helper_code=excluded.helper_code,helper_name=excluded.helper_name,name=excluded.name,
    phone_primary=excluded.phone_primary,phone=excluded.phone,branch_code=excluded.branch_code,
    employment_type=excluded.employment_type,status='active',updated_at=now();

-- Repair existing mobile workforce rows by workforce code first.
update public.be_mobile_workforce_accounts w
set full_name=m.display_name,
    display_name=m.display_name,
    name=m.display_name,
    role=m.role_code,
    role_type=lower(m.role_code),
    workforce_type=lower(m.role_code),
    workforce_code=m.workforce_code,
    worker_code=m.workforce_code,
    account_code=m.workforce_code,
    employee_code=m.workforce_code,
    rider_code=case when m.role_code='RIDER' then m.workforce_code else null end,
    driver_code=case when m.role_code='DRIVER' then m.workforce_code else null end,
    helper_code=case when m.role_code='HELPER' then m.workforce_code else null end,
    email=m.email,
    user_email=m.email,
    phone=coalesce(m.phone,w.phone),
    phone_number=coalesce(m.phone,w.phone_number),
    phone_primary=coalesce(m.phone,w.phone_primary),
    branch_code=m.branch_code,
    employment_type=coalesce(m.employment_type,w.employment_type),
    status='Active',
    active=true,
    is_active=true,
    auth_user_id=(select u.id from auth.users u where lower(u.email)=lower(m.email) limit 1),
    aliases=jsonb_build_array(m.workforce_code,split_part(m.email,'@',1),m.email),
    metadata=coalesce(w.metadata,'{}'::jsonb)||jsonb_build_object(
      'source','be_master_drivers_riders_helpers_rows1.csv',
      'identity_aligned_at',now()
    ),
    updated_at=now()
from tmp_workforce_email_name_v89 m
where upper(coalesce(w.workforce_code,''))=upper(m.workforce_code);

-- Add any attached identities not previously present in mobile workforce.
insert into public.be_mobile_workforce_accounts
(worker_id,full_name,role_type,phone_number,branch_code,status,workforce_code,worker_code,email,phone,
 display_name,role,active,auth_user_id,metadata,updated_at,workforce_type,account_code,
 employment_type,is_active,aliases,rider_code,driver_code,helper_code,employee_code,name,user_email,phone_primary)
select
 m.workforce_code,m.display_name,lower(m.role_code),m.phone,m.branch_code,'Active',
 m.workforce_code,m.workforce_code,m.email,m.phone,m.display_name,m.role_code,true,
 (select u.id from auth.users u where lower(u.email)=lower(m.email) limit 1),
 jsonb_build_object('source','be_master_drivers_riders_helpers_rows1.csv','identity_aligned_at',now()),
 now(),lower(m.role_code),m.workforce_code,m.employment_type,true,
 jsonb_build_array(m.workforce_code,split_part(m.email,'@',1),m.email),
 case when m.role_code='RIDER' then m.workforce_code end,
 case when m.role_code='DRIVER' then m.workforce_code end,
 case when m.role_code='HELPER' then m.workforce_code end,
 m.workforce_code,m.display_name,m.email,m.phone
from tmp_workforce_email_name_v89 m
where not exists (
  select 1 from public.be_mobile_workforce_accounts w
  where upper(coalesce(w.workforce_code,''))=upper(m.workforce_code)
);

-- Auth-linked profiles: exact name, role and workforce code.
insert into public.profiles
(id,email,full_name,role,phone,status,updated_at,branch_name,app_role,user_role,role_code,is_approved,is_active,employee_id)
select u.id,m.email,m.display_name,m.role_code,m.phone,'active',now(),m.branch_code,
       m.role_code,m.role_code,m.role_code,true,true,m.workforce_code
from tmp_workforce_email_name_v89 m
join auth.users u on lower(u.email)=lower(m.email)
on conflict (id) do update
set email=excluded.email,
    full_name=excluded.full_name,
    role=excluded.role,
    phone=coalesce(excluded.phone,profiles.phone),
    status='active',
    updated_at=now(),
    branch_name=excluded.branch_name,
    app_role=excluded.app_role,
    user_role=excluded.user_role,
    role_code=excluded.role_code,
    is_approved=true,
    is_active=true,
    employee_id=excluded.employee_id;

-- Keep Auth-visible name/role metadata aligned as well.
update auth.users u
set raw_user_meta_data=coalesce(u.raw_user_meta_data,'{}'::jsonb) ||
  jsonb_build_object(
    'full_name',m.display_name,
    'name',m.display_name,
    'role',lower(m.role_code),
    'role_code',m.role_code,
    'workforce_code',m.workforce_code,
    'branch_code',m.branch_code
  ),
  updated_at=now()
from tmp_workforce_email_name_v89 m
where lower(u.email)=lower(m.email);
