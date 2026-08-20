-- ============================================================
-- Britium Express Clean Enterprise Portal
-- 10-seed-masterdata-from-authoritative-template.sql
-- Source: attached Britium master data template files.
-- This seed is idempotent and uses template codes as the only canonical source.
-- ============================================================

truncate public.be_masterdata_merchants cascade;
insert into public.be_masterdata_merchants(merchant_id, merchant_code, merchant_name, contact_phone, pickup_address, pickup_township, pickup_city, payment_profile, service_profile, tariff_tier, status) values
('ALN', 'ALN', 'Alnoor', '09448088835', 'No. (1526), Ward (45), Zawgyi Road, North Dagon', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'inactive'),
('APA', 'APA', 'APAC', '09888867040', 'No. (7), San Pale (7) Street, Bo Lein Aung Mingalar Ward, west of Yuzana Plaza, APAC Tower', 'Tamwe', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('APS', 'APS', 'Aung Pyae Sone', '09752660008', 'No. (7), beside Ayeyarwun Main Road, Kwe Ma Housing, 10th Ward', 'Thaketa', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('BBG', 'BBG', 'Baby Genius', '09766482813', 'No. (284/979), Bo Moe Kyo Road, Ward (9), East Dagon', 'East Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('BBK', 'BBK', 'Baby Kyaw', '09796491867', 'No. (115-Ka), Ward (9), Yuzana Road, Shwe Pyi Thar', 'Shwe Pyi Thar', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('BBR', 'BBR', 'Best Buy in Rangoon', '09977730920', 'No. (2), Ground Floor, Maha Bawga Road, Hledan', 'Kamayut', 'Yangon', 'COD', 'Standard', 'Standard', 'inactive'),
('BBT', 'BBT', 'BabyTop', '09699468766', 'No. (23), corner of 130th Street and Thone Myaung Road, Mingalar Taung Nyunt', 'Mingala Taung Nyunt', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('CUY', 'CUY', 'Curvy (Office)', '09776527618', 'No. (896), Aung Thiri (2) Street, Ward (28)', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('CUY(YK)', 'CUY(YK)', 'Curvy (Yankin)', '09-772233150', 'No. (217), Thitsar Road, Ward (13), Yankin', 'Yankin', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('CUY(JS)', 'CUY(JS)', 'Curvy (Junction Square)', '09-754614522', 'Junction Square Shopping Mall, First Floor, Pyay Road and Kyun Taw Road, Kamayut', 'Kamayut', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('DDC', 'DDC', 'DDC BC', '0969793443', 'No. (422), Bo Myat Tun Road, corner of Zizawar Road, Ward (47)', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'inactive'),
('DSD', 'DSD', 'Daw Sanda', '09776110406', 'No. (439), Nay Kyar 1 Street, Ward (50), North Dagon, Yangon', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('ETE', 'ETE', 'Ei Tone', '095409045', 'Building No. (31), Room 6, West Kyo Kone Yeiktha, second street after Kyo Kone Flower Market, unnamed street on the road to Insein RTAD', 'Insein', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('HAM', 'HAM', 'HAIM', '0424426681', 'No. (665), Bo Saw Aung Road, Ward (9), East Dagon Township, Yangon Region', 'East Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('HMS', 'HMS', 'Hla Myittar Shin', '09264365636', 'No. (542), Lay Daunk Kan Ward, Kandaw Road, Thingangyun', 'Thingangyun', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('JLS', 'JLS', 'July Sis', '09698793840', 'No. (232), Sakkawat (3) Street, Zay Market, North Okkalapa', 'North Okkalapa', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('KKK', 'KKK', 'Ko Kyaw Clothing', '09988198263', 'No. (23), Lutlatyay Lane (1), Ward (Ga), Thingangyun', 'Thingangyun', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('LOS', 'LOS', 'Lady OS', '09981435810', 'No. (63), Pho Mye Road, on Myanmar Gon Yi Road, Mingalar Taung Nyunt', 'Mingala Taung Nyunt', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('MBO', 'MBO', 'MaBel OS', '09893341595', 'No. (825/B), Saw Yan Paing Road, Ward (29), North Dagon', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('MDY', 'MDY', 'Mandalay Branch', '09765540091', 'House No. (B/4), 65th Street, between 30th and 31st Streets, Mandalay', 'Mandalay', 'Mandalay', 'COD', 'Standard', 'Standard', 'active'),
('MEL', 'MEL', 'Mee Lay', '09799737996', 'No. (2212), Maha Bandula Road, Hlawga Lower Gate Bus Stop, Shwe Pyi Thar', 'Shwe Pyi Thar', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('NDN', 'NDN', 'NDN', '09890334723', 'No. (1000), Anawrahta Road, Ward (38)', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('NFS', 'NFS', 'Nwe Fashion', '09777099242', 'No. (57), Sipin Road, Ward 19(A), South Dagon', 'South Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('NFT', 'NFT', 'Nfinity', '09794908400', 'Block 14(B), Ayar Chan Thar Condo, Dagon Seikkan Township, Ayeyarwun Main Road', 'South Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('NHT', 'NHT', 'Nan Htike Tan', '09764881098', 'No. (689), Mayu (4) Street, Ward (6), East Dagon', 'East Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('NPT', 'NPT', 'Nay Pyi Taw Branch', '09782326699', 'No. (5), Aung Zabu Ward (9), in front of Naypyidaw Council, Zabuthiri Township, Naypyidaw', 'Nay Pyi Taw', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('PLE', 'PLE', 'Pleasure', '09740908663', 'No. (57), Ngu Wah Road, Ahlone', 'Alone', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('POC', 'POC', 'PO Clothing', '09420093957', 'No. (97/B), Mya Marlar Road, Ward (9), Shwe Pyi Thar', 'Shwe Pyi Thar', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('PPL', 'PPL', 'Poe Poe Lay', '09253420220', 'Between Streets 11 and 12, on Ayar Main Road, Nya Ward, North Okkalapa', 'North Okkalapa', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('PRE', 'PRE', 'PREMIER', '09260644879', 'No. (299-A), Mya Marlar Road, Thaketa Industrial Zone', 'Thaketa', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('PSO', 'PSO', 'Phyu Sin OS', '09740908663', 'No. (57), Ngu Wah Road, Ahlone', 'Kyimyindaing', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('PTB', 'PTB', 'Pi Ti Sar Pay', '09257060323', 'No. (1170), Min Ye Kyaw Swar Main Road, Ward (133), East Dagon Township, Yangon', 'East Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('PTP', 'PTP', 'Pan Tharaphy', '095191464', 'No. (47/B1), Pho Sein Road, Bahan', 'Bahan', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('PYT', 'PYT', 'Payit Ka lay', '09669716499', 'Police Staff Housing, Mahasi Sasana Yeiktha Road, Bahan', 'Bahan', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('SEN', 'SEN', 'Shwe Eaint', '09944436600', 'No. (25), Aung Thapyay West (5) Street, Ward (7), Thaketa', 'Thaketa', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('SHS', 'SHS', 'Shwe Sin', '09975538286', 'No. (815), Anawrahta Road, Ward (9), East Dagon', 'East Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('SMH', 'SMH', 'Shaw Mahar', '09777759111', 'No. (1235), corner of Min Road and Min Road (2), Ward (55), South Dagon', 'South Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('SSF', 'SSF', 'Su Su Fashion World', '09786872727', 'Building (1), A1, Ward (42), U Wisara Main Road, in front of Maha Myaing Housing, North Dagon', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('STZ', 'STZ', 'Saung Thazin', '09799951012', 'No. (1074), Htan Chauk Pin, Thiri Mingalar Circular Road, in front of Kyan Taing Aung Pagoda, Phaya Lay Road, Shwe Pyi Thar', 'Shwe Pyi Thar', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('SYE', 'SYE', 'Shwe Yee', '09752882403', 'Near Dagon Ayar Highway, Sein Tharaphu (2) Street, opposite Pattamyar Nwe Phone Shop', 'Hlaing Thar Yar', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('TGK', 'TGK', 'Thingangyun Bracnh', '09424596830', 'No. (114/B), Pyitawaye Road, Lay Daunk Kan Ward, Thingangyun', 'Thingangyun', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('UQD', 'UQD', 'Unique/Diva', '09888867040', 'No. (7), San Pale (7) Street, Bo Lein Aung Mingalar Ward, west of Yuzana Plaza, APAC Tower', 'Tamwe', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('BBW', 'BBW', 'Baby world', '09759791826', 'No. (22), Bo Hmu Ba Htoo Road, Ward (6), East Dagon', 'East Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('SFH', 'SFH', 'Sweety Fashion House', '09451578299', 'No. (879), Metta Road, in front of 13 Market, in front of Ngwe Yamone Market, South Okkalapa', 'South Okkalapa', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('ZZE', 'ZZE', 'Zan Zan Export Clothings', '09673648505', 'No. (159-B), Thiri Mingalar Circular Road, Ward 5/6, Shwe Pyi Thar', 'Shwe Pyi Thar', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('FFU', 'FFU', 'Food For U', '099777809039', 'No. (1265), Ground Floor, Bo Min Yaung Road, Ward (41), North Dagon', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('SOS', 'SOS', 'Singapore Online Shop', '09250050750', 'No. (716/A), Maha Bandula Road, also known as Mandalay Road, Ward (46), North Dagon', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('AK', 'AK', 'A&K Collection', '09-978939591', 'No. (125/B), Ward 14/3, Thandumar Main Road, near Okkalapa Pagoda, South Okkalapa', 'South Okkalapa', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('SLN', 'SLN', 'Slinnar''s Beauty Club North Dagon', '09-954033833', 'On Bayint Naung Main Road, in front of Pinlon City Mall, Pinlon Hill, Second Floor, North Dagon', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('TZ', 'TZ', 'TZ-5 Fashion Shop', '09-981381635', 'No. (266), Metta Road, Ward (10), South Okkalapa', 'South Okkalapa', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('KWY', 'KWY', 'kyal Win yan', '09-765144772', 'No. (40)/(Ta-173), Min Ye Kyaw Swar Road, Ward (40), North Dagon', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('PP', 'PP', 'PANN PANN Orchid Garden', '09-791596959', 'No. (383), Sein Pan Road, Ward (40), North Dagon', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('NKS', 'NKS', 'Neo Kids', '09-5199004', 'No. (698), Baya Thingyan Road, Ward (10), South Okkalapa', 'South Okkalapa', 'Yangon', 'COD', 'Standard', 'Standard', 'active')
on conflict (merchant_code) do update set merchant_name=excluded.merchant_name, contact_phone=excluded.contact_phone, pickup_address=excluded.pickup_address, pickup_township=excluded.pickup_township, pickup_city=excluded.pickup_city, status=excluded.status, updated_at=now();

truncate public.be_masterdata_riders cascade;
insert into public.be_masterdata_riders(rider_id, rider_name, phone_primary, nrc_or_id_no, assigned_zone, employment_type, status) values
('RID001', 'Ko Kyaw Zin Khant', '09-779 052 872', '12/DaGaYa(N)032246', 'Yangon Central', 'Permanent', 'Active'),
('RID002', 'Ko Paing Zay Htet', '09-779 615 147', '14/DaDaYa(N)246279', 'Yangon South', 'Permanent', 'Active'),
('RID003', 'Ko Chit Yin Htoo', '09-662 385 475', '12/DaGaYa(N)052464', 'Yangon North', 'Permanent', 'Active'),
('RID004', 'Ko Wai Lin Phyo', '09-779 634 710', '14/PaThaNa(N)366317', 'Yangon North', 'Permanent', 'Active'),
('RID005', 'Ko Aye Chan Soe', '09-259 725 323', '13/KaTaNa(N)211849', 'Yangon North', 'Permanent', 'Active'),
('RID006', 'Ma Myo Pa Pa Aung', '09-779 617 044', '12/DaGaYa(N)023361', 'Yangon East', 'Permanent', 'Active'),
('RID007', 'Ko Myo Min Kyaw', '09-775 018 446', '12/MaYaKa(N)187754', 'Yangon Central', 'Permanent', 'Active'),
('RID008', 'Ko Than Min Soe', '09-786 015 602', '12/MaBaNa(N)228656', 'Yangon South', 'Contract', 'Active'),
('RID009', 'Ko S Lin Phyo', '09-965 023 790', '12/DaGaYa(N)038819', 'Yangon Central', 'Contract', 'Active')
on conflict (rider_id) do update set rider_name=excluded.rider_name, phone_primary=excluded.phone_primary, assigned_zone=excluded.assigned_zone, status=excluded.status;

truncate public.be_masterdata_drivers cascade;
insert into public.be_masterdata_drivers(driver_id, driver_name, phone_primary, license_no, license_expiry_date, assigned_fleet_id, status) values
('DRV001', 'Ko Wai Phyo Lwin', '09-260 741 691', 'D/00138/12', '07.05.2027', 'Hlaing Thar Yar , Insein', 'Active'),
('DRV002', 'Ko Tun Min Aung', '09-942 540 630', 'E/01923/25', '23.06.2028', 'Thaketa,Mingalartaung Nyunt,Tamwe', 'Active'),
('DRV003', 'Aung Zaw Moe', '09-750 099 581', 'B/06711/23', '16.02.2028', 'Downtown', 'Active'),
('DRV004', 'Ko Wai Yan Phyo', '09-757 052 761', 'B/08656/19', '05.12.2029', 'Shwe Pyi Thar , Mingalardon , North Okkalapa', 'Active'),
('DRV005', 'Ko Kyaw Myo Aung', '09-770 696 670', 'B/05214/18', '25.5.2028', 'Mayangone, Hlaing , Kamayut', 'Active'),
('DRV006', 'Win Naing Tun', '09-679 874 786', 'B/19817/22', '22.4.2027', 'Dagon Seinkkan, South Dagon', 'Active')
on conflict (driver_id) do update set driver_name=excluded.driver_name, phone_primary=excluded.phone_primary, assigned_fleet_id=excluded.assigned_fleet_id, status=excluded.status;

truncate public.be_masterdata_fleet cascade;
insert into public.be_masterdata_fleet(fleet_id, vehicle_no, vehicle_type, capacity_kg, capacity_cbm, assigned_driver_id, ownership_type, insurance_expiry_date, status, zone_note) values
('FLT001', '6H - 7397', 'Van', 700.0, 5.0, 'Ko Tun Min Aung', 'Owned', '2027.01.31', 'Assigned', 'Aungmingalar highway bus stop — nearby cargo pickup'),
('FLT002', '4S - 1626', 'Mini Truck', 850.0, 4.0, 'Ko Wai Phyo Lwin', 'Owned', '2027.01.31', 'Assigned', 'Zone 1'),
('FLT003', '2Q - 6524', 'Mini Truck', 850.0, 4.0, 'Ko Win Naing Tun', 'Owned', '2027.01.31', 'Assigned', 'Zone 2'),
('FLT004', '7R - 1473', 'Mini Truck', 780.0, 1.0, 'Ko Aung Zaw Moe', 'Owned', '2027.01.31', 'Assigned', 'Zone 3'),
('FLT005', '9R - 4431', 'Van', 300.0, 3.0, 'Ko Kyaw Myo Aung', 'Owned', '2026.07.06', 'Assigned', 'Zone 4'),
('FLT006', '7K - 1890', 'Box Truck', 1000.0, 10.0, 'Ko Wai Yan Phyo', null, '2027.01.31', 'Assigned', 'Dagonthiri highway bus stop — nearby cargo pickup')
on conflict (fleet_id) do update set vehicle_no=excluded.vehicle_no, vehicle_type=excluded.vehicle_type, assigned_driver_id=excluded.assigned_driver_id, status=excluded.status, zone_note=excluded.zone_note;

-- Keep workforce dropdowns template-only: remove generated rider/driver records without auth mappings.
delete from public.be_mobile_workforce_accounts;
insert into public.be_mobile_workforce_accounts(worker_id, workforce_code, full_name, role_type, phone_number, branch_code, vehicle_type, license_plate, status) select rider_id, rider_id, rider_name, 'rider', phone_primary, 'YGN', null, null, lower(status) from public.be_masterdata_riders where lower(status)='active' on conflict(worker_id) do update set workforce_code=excluded.workforce_code, full_name=excluded.full_name, phone_number=excluded.phone_number, status=excluded.status;
insert into public.be_mobile_workforce_accounts(worker_id, workforce_code, full_name, role_type, phone_number, branch_code, vehicle_type, license_plate, status) select d.driver_id, d.driver_id, d.driver_name, 'driver', d.phone_primary, 'YGN', f.vehicle_type, f.vehicle_no, lower(d.status) from public.be_masterdata_drivers d left join public.be_masterdata_fleet f on f.assigned_driver_id = d.driver_name or f.assigned_driver_id = d.driver_id where lower(d.status)='active' on conflict(worker_id) do update set workforce_code=excluded.workforce_code, full_name=excluded.full_name, phone_number=excluded.phone_number, vehicle_type=excluded.vehicle_type, license_plate=excluded.license_plate, status=excluded.status;

-- Add riders/drivers as workforce users without auth_user_id; real login users can later be mapped by setting auth_user_id.
insert into public.be_user_account_registry(user_id, full_name, role, phone_number, branch_code, vehicle_type, license_plate, status)
select gen_random_uuid(), full_name, role_type, phone_number, branch_code, vehicle_type, license_plate, status
from public.be_mobile_workforce_accounts w
where not exists (
  select 1 from public.be_user_account_registry u
  where u.full_name = w.full_name and u.role = w.role_type
);

notify pgrst, 'reload schema';
