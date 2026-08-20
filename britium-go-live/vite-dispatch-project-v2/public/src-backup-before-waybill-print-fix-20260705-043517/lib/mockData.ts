export const mockOrders = Array.from({ length: 40 }, (_, i) => ({
  id:            i % 2 === 0 ? `PU-015${String(i+1).padStart(3,"0")}` : `DV-016${String(i+1).padStart(3,"0")}`,
  type:          i % 2 === 0 ? "PICKUP" : "DELIVERY",
  merchant:      ["Kyaw Store", "Star Fashion", "Golden Tech", "Beauty Plus", "Fresh Mart"][i % 5],
  customer:      ["Ma Aye", "Ko Zaw", "Daw Khin", "U Thant", "Ko Naing"][i % 5],
  address:       ["No.12 Bo Aung Kyaw St, Dagon", "No.45 Pyay Rd, Kamayut", "No.7 Shwe Dagon, Yankin"][i % 3],
  zone:          ["East Dagon", "Dagon", "Kamayut", "Yankin", "Tamwe"][i % 5],
  rider:         ["Ko Aung", "Ma Win", "Ko Myo", "Ko Htet", "Ma Khin"][i % 5],
  status:        ["PICKUP_REQUESTED","PICKUP_ASSIGNED","OUT_FOR_DELIVERY","DELIVERED","PICKUP_FAILED","WAREHOUSE_HOLD","DELIVERY_ATTEMPTED","PICKUP_COMPLETED"][i % 8],
  cod:           [0, 5000, 12000, 25000, 8000, 15000][i % 6],
  weight:        [0.5, 1.2, 2.5, 4.0, 0.8][i % 5],
  createdAt:     `2026-06-${String((i % 9)+1).padStart(2,"0")} ${String(8+(i%10)).padStart(2,"0")}:${String(i%60).padStart(2,"0")}`,
  attempts:      i % 4 === 0 ? 2 : 1,
}));

export const mockMerchants = [
  { code:"M001", name:"Kyaw Store",      type:"Online Shop",    phone:"+95-9-123456", orders:245, delivered:220, failed:8,  revenue:2450000, status:"Active" },
  { code:"M002", name:"Star Fashion",   type:"Fashion",        phone:"+95-9-234567", orders:187, delivered:172, failed:5,  revenue:1870000, status:"Active" },
  { code:"M003", name:"Golden Tech",    type:"Electronics",    phone:"+95-9-345678", orders:312, delivered:295, failed:12, revenue:3120000, status:"Active" },
  { code:"M004", name:"Beauty Plus",    type:"Cosmetics",      phone:"+95-9-456789", orders:98,  delivered:91,  failed:3,  revenue:980000,  status:"Active" },
  { code:"M005", name:"Fresh Mart",     type:"F&B",            phone:"+95-9-567890", orders:421, delivered:398, failed:18, revenue:4210000, status:"Active" },
  { code:"M006", name:"Zaw Electronics",type:"Electronics",    phone:"+95-9-678901", orders:156, delivered:140, failed:7,  revenue:1560000, status:"Inactive"},
  { code:"M007", name:"Htet Pharmacy",  type:"Pharmacy",       phone:"+95-9-789012", orders:89,  delivered:86,  failed:2,  revenue:890000,  status:"Active" },
  { code:"M008", name:"Win Fashion",    type:"Fashion",        phone:"+95-9-890123", orders:203, delivered:188, failed:9,  revenue:2030000, status:"Active" },
];

export const mockRiders = [
  { id:"R001", name:"Ko Aung Naing",  phone:"+95-9-111111", zone:"East Dagon",  type:"Rider",  status:"Active",  today:12, commissionToday:3600, vehicle:"Motorcycle" },
  { id:"R002", name:"Ma Win Kyi",     phone:"+95-9-222222", zone:"Dagon",       type:"Rider",  status:"Active",  today:9,  commissionToday:2700, vehicle:"Motorcycle" },
  { id:"R003", name:"Ko Myo Zaw",     phone:"+95-9-333333", zone:"Kamayut",     type:"Driver", status:"Active",  today:18, commissionToday:3600, vehicle:"Van"        },
  { id:"R004", name:"Ko Htet Naing",  phone:"+95-9-444444", zone:"Yankin",      type:"Rider",  status:"On Leave",today:0,  commissionToday:0,    vehicle:"Motorcycle" },
  { id:"R005", name:"Ma Khin Hnin",   phone:"+95-9-555555", zone:"Tamwe",       type:"Rider",  status:"Active",  today:15, commissionToday:4500, vehicle:"Motorcycle" },
  { id:"R006", name:"Ko Min Thu",     phone:"+95-9-666666", zone:"Insein",      type:"Driver", status:"Active",  today:22, commissionToday:4400, vehicle:"Mini Truck" },
  { id:"R007", name:"Daw Thida",      phone:"+95-9-777777", zone:"Mayangone",   type:"Rider",  status:"Active",  today:8,  commissionToday:2400, vehicle:"Motorcycle" },
  { id:"R008", name:"Ko Zaw Lin",     phone:"+95-9-888888", zone:"Hlegu",       type:"Driver", status:"Active",  today:14, commissionToday:2800, vehicle:"Van"        },
];

export const mockFleet = [
  { id:"FL001", plate:"6H-7397",  type:"Van",        zone:"East Dagon",  status:"Available",  kg:800,  cbm:4.5,  insurance:"2026-12-31", driver:"Ko Myo Zaw"   },
  { id:"FL002", plate:"3A-2281",  type:"Mini Truck", zone:"Dagon",       status:"Assigned",   kg:2000, cbm:12.0, insurance:"2026-08-15", driver:"Ko Min Thu"   },
  { id:"FL003", plate:"7C-5512",  type:"Van",        zone:"Yankin",      status:"Maintenance",kg:800,  cbm:4.5,  insurance:"2026-06-30", driver:"—"            },
  { id:"FL004", plate:"1B-9934",  type:"Box Truck",  zone:"Mandalay HWY",status:"Available",  kg:5000, cbm:25.0, insurance:"2027-03-10", driver:"Ko Zaw Lin"   },
  { id:"FL005", plate:"4D-1178",  type:"Van",        zone:"South Dagon", status:"Available",  kg:800,  cbm:4.5,  insurance:"2026-09-20", driver:"—"            },
  { id:"FL006", plate:"8E-3345",  type:"Motorcycle", zone:"Tamwe",       status:"Assigned",   kg:50,   cbm:0.2,  insurance:"2026-11-05", driver:"Ma Khin Hnin" },
];

export const mockExceptions = [
  { id:"EX-001", shipment:"PU-015001", type:"PICKUP",   code:"CUSTOMER_NOT_AVAILABLE", status:"PICKUP_FAILED",       severity:"Low",    rider:"Ko Aung Naing",  date:"2026-06-09 09:15",  zone:"East Dagon",  action:"RESCHEDULE_PICKUP",  resolved:false },
  { id:"EX-002", shipment:"DV-016012", type:"DELIVERY", code:"COD_NOT_READY",          status:"DELIVERY_RESCHEDULED",severity:"Medium", rider:"Ma Win Kyi",     date:"2026-06-09 10:30",  zone:"Dagon",       action:"RESCHEDULE_DELIVERY",resolved:false },
  { id:"EX-003", shipment:"WH-00234",  type:"WAREHOUSE",code:"WEIGHT_MISMATCH",        status:"QC_FAILED",           severity:"High",   rider:"Warehouse Team", date:"2026-06-09 08:00",  zone:"Main Hub",    action:"RECALCULATE_TARIFF", resolved:true  },
  { id:"EX-004", shipment:"DV-016015", type:"DELIVERY", code:"CUSTOMER_REFUSED",       status:"CUSTOMER_REFUSED",    severity:"Medium", rider:"Ko Myo Zaw",     date:"2026-06-09 11:45",  zone:"Kamayut",     action:"CS_REVIEW_OR_RTO",   resolved:false },
  { id:"EX-005", shipment:"PU-015008", type:"PICKUP",   code:"RESTRICTED_ITEM",        status:"PICKUP_REJECTED",     severity:"High",   rider:"Ko Htet Naing",  date:"2026-06-08 14:20",  zone:"Yankin",      action:"COMPLIANCE_REVIEW",  resolved:true  },
  { id:"EX-006", shipment:"WH-00189",  type:"WAREHOUSE",code:"DAMAGED_PARCEL",         status:"DAMAGED",             severity:"High",   rider:"Warehouse Team", date:"2026-06-08 16:00",  zone:"Main Hub",    action:"DAMAGE_REVIEW",      resolved:false },
  { id:"EX-007", shipment:"DV-016022", type:"DELIVERY", code:"PHONE_UNREACHABLE",      status:"DELIVERY_ATTEMPTED", severity:"Low",    rider:"Ma Khin Hnin",   date:"2026-06-09 13:10",  zone:"Tamwe",       action:"RETRY_OR_CS_FOLLOWUP",resolved:false},
  { id:"EX-008", shipment:"PU-015019", type:"PICKUP",   code:"WRONG_PICKUP_ADDRESS",   status:"ADDRESS_CORRECTION_REQUIRED",severity:"Medium",rider:"Ko Min Thu",date:"2026-06-09 09:55",zone:"Insein",    action:"CS_ADDRESS_REVIEW",  resolved:false },
];

export const mockCSTickets = [
  { id:"CS-001", ref:"DV-016012", type:"Reschedule Request", customer:"Ma Aye",  merchant:"Kyaw Store",   status:"Open",     priority:"High",   assignee:"CS Agent 1",  date:"2026-06-09" },
  { id:"CS-002", ref:"PU-015019", type:"Address Correction", customer:"Ko Zaw",  merchant:"Star Fashion", status:"In Progress",priority:"Medium",assignee:"CS Agent 2", date:"2026-06-09" },
  { id:"CS-003", ref:"DV-016004", type:"RTO Request",        customer:"Daw Khin",merchant:"Golden Tech",  status:"Resolved", priority:"Low",    assignee:"CS Agent 1",  date:"2026-06-08" },
  { id:"CS-004", ref:"WH-00189",  type:"Damage Claim",       customer:"U Thant", merchant:"Beauty Plus",  status:"Open",     priority:"High",   assignee:"CS Manager",  date:"2026-06-09" },
  { id:"CS-005", ref:"DV-016022", type:"Customer Unreachable",customer:"Ko Naing",merchant:"Fresh Mart",  status:"In Progress",priority:"Low",  assignee:"CS Agent 3",  date:"2026-06-09" },
];

export const weeklyOrderTrend = [
  { day:"Mon", pickup:145, delivery:132, exceptions:12 },
  { day:"Tue", pickup:178, delivery:165, exceptions:9  },
  { day:"Wed", pickup:162, delivery:155, exceptions:15 },
  { day:"Thu", pickup:190, delivery:180, exceptions:8  },
  { day:"Fri", pickup:205, delivery:195, exceptions:18 },
  { day:"Sat", pickup:230, delivery:218, exceptions:14 },
  { day:"Sun", pickup:125, delivery:115, exceptions:7  },
];

export const exceptionBreakdown = [
  { name:"Pickup",   value:32, color:"#3B82F6" },
  { name:"Warehouse",value:18, color:"#F59E0B" },
  { name:"Delivery", value:47, color:"#EF4444" },
];

export const zonePerformance = [
  { zone:"East Dagon", orders:245, onTime:228, rate:93 },
  { zone:"Dagon",      orders:198, onTime:181, rate:91 },
  { zone:"Kamayut",    orders:156, onTime:143, rate:92 },
  { zone:"Yankin",     orders:134, onTime:120, rate:90 },
  { zone:"Tamwe",      orders:112, onTime:101, rate:90 },
  { zone:"Insein",     orders:89,  onTime:79,  rate:89 },
];

export const riderTasks = [
  { id:"PU-015241", type:"PICKUP",   merchant:"Kyaw Store",  address:"No.12 Bo Aung Kyaw St, East Dagon", cod:0,     weight:1.2, status:"PICKUP_ASSIGNED",  phone:"+95-9-123456" },
  { id:"PU-015242", type:"PICKUP",   merchant:"Star Fashion",address:"No.34 Mingalar Rd, East Dagon",     cod:0,     weight:0.8, status:"PICKUP_ASSIGNED",  phone:"+95-9-234567" },
  { id:"DV-016189", type:"DELIVERY", customer:"Ma Aye",      address:"No.7 Shwe Dagon, East Dagon",       cod:12000, weight:1.5, status:"OUT_FOR_DELIVERY", phone:"+95-9-987654" },
  { id:"DV-016190", type:"DELIVERY", customer:"Ko Zaw",      address:"No.22 Kaemara Rd, East Dagon",      cod:0,     weight:0.6, status:"OUT_FOR_DELIVERY", phone:"+95-9-876543" },
  { id:"DV-016191", type:"DELIVERY", customer:"Daw Khin",    address:"No.55 Strand Rd, Dagon",            cod:8500,  weight:2.1, status:"OUT_FOR_DELIVERY", phone:"+95-9-765432" },
  { id:"DV-016192", type:"DELIVERY", customer:"U Thant",     address:"No.18 Bogyoke Rd, Dagon",           cod:25000, weight:3.0, status:"DELIVERY_ATTEMPTED",phone:"+95-9-654321"},
];

export const riderEarnings = {
  today:      { pickups:4, deliveries:8, total:2400 + 4*150 },
  thisWeek:   { pickups:22, deliveries:41, total:22*150 + 41*300 },
  thisMonth:  { pickups:88, deliveries:167, total:88*150 + 167*300 },
};
