import pandas as pd
import numpy as np

def parse_amount(val):
    """Safely converts string amounts like '-' or '45,000' to integers."""
    if pd.isna(val) or str(val).strip() == '-': 
        return 0
    try: 
        return int(float(str(val).replace(',', '').strip()))
    except ValueError: 
        return 0

def convert_inbound_to_waybill():
    inbound_file = "Inboundmanifest_template.xlsx"
    waybill_template = "Waybillgeneratetemplate.xlsx"
    postal_file = "Myanmar_Postalcodes_All_MM.xlsx"
    output_file = "Waybill_Generated_Ready.xlsx"
    
    print("Loading files...")
    # Read files
    inbound_df = pd.read_excel(inbound_file)
    waybill_df = pd.read_excel(waybill_template)
    
    # Load and combine all postal code sheets
    pc_xls = pd.ExcelFile(postal_file)
    all_pc_df = []
    for sheet in pc_xls.sheet_names:
        df = pd.read_excel(postal_file, sheet_name=sheet)
        df.columns = ['Region', 'Township', 'Ward', 'PostalCode']
        all_pc_df.append(df)
    pc_df = pd.concat(all_pc_df, ignore_index=True)
    
    # 1. Standard Region Mapping
    region_map = {
        'ဧရာဝတီတိုင်းဒေသကြီး': 'Ayeyarwady Region / ဧရာဝတီတိုင်းဒေသကြီး',
        'ရှမ်းပြည်နယ် (အရှေ့)': 'Shan State (East) / ရှမ်းပြည်နယ် (အရှေ့)',
        'ရှမ်းပြည်နယ် (မြောက်ပိုင်း)': 'Shan State (North) / ရှမ်းပြည်နယ် (မြောက်ပိုင်း)',
        'ရှမ်းပြည်နယ် (တောင်ပိုင်း)': 'Shan State (South) / ရှမ်းပြည်နယ် (တောင်ပိုင်း)',
        'ရခိုင်ပြည်နယ်': 'Rakhine State / ရခိုင်ပြည်နယ်',
        'မွန်ပြည်နယ်': 'Mon State / မွန်ပြည်နယ်',
        'မကွေးတိုင်းဒေသကြီး': 'Magway Region / မကွေးတိုင်းဒေသကြီး',
        'ပဲခူးတိုင်းဒေသကြီး (အရှေ့)': 'Bago Region (East) / ပဲခူးတိုင်းဒေသကြီး (အရှေ့)',
        'ပဲခူးတိုင်းဒေသကြီး (အနောက်)': 'Bago Region (West) / ပဲခူးတိုင်းဒေသကြီး (အနောက်)',
        'တနင်္သာရီတိုင်းဒေသကြီး': 'Tanintharyi Region / တနင်္သာရီတိုင်းဒေသကြီး',
        'စစ်ကိုင်းတိုင်းဒေသကြီး': 'Sagaing Region / စစ်ကိုင်းတိုင်းဒေသကြီး',
        'ချင်းပြည်နယ်': 'Chin State / ချင်းပြည်နယ်',
        'ကရင်ပြည်နယ်': 'Kayin State / ကရင်ပြည်နယ်',
        'ကယားပြည်နယ်': 'Kayah State / ကယားပြည်နယ်',
        'ကချင်ပြည်နယ်': 'Kachin State / ကချင်ပြည်နယ်',
        'ရန်ကုန်တိုင်းဒေသကြီး': 'Yangon Region / ရန်ကုန်တိုင်းဒေသကြီး',
        'နေပြည်တော် (ပြည်ထောင်စုနယ်မြေ)': 'Naypyitaw Union Territory / နေပြည်တော် (ပြည်ထောင်စုနယ်မြေ)',
        'မန္တလေးတိုင်းဒေသကြီး': 'Mandalay Region / မန္တလေးတိုင်းဒေသကြီး'
    }
    
    # 2. Fix spelling and regional differences in Township names
    town_aliases = {
        'ကြည့်မြင်တိုင်': 'ကြည့်မြင်တိုင်',
        'မင်္ဂလာတောင်ညွန့်': 'မင်္ဂလာတောင်ညွန့်',
        'တောင်ဒဂုံ': 'ဒဂုံမြို့သစ် (တောင်ပိုင်း)',
        'အရှေ့ဒဂုံ': 'ဒဂုံမြို့သစ် (အရှေ့ပိုင်း)',
        'မြောက်ဒဂုံ': 'ဒဂုံမြို့သစ် (မြောက်ပိုင်း)',
        'ဆိပ်ကမ်း': 'ဒဂုံမြို့သစ် (ဆိပ်ကမ်း)',
        'လှိုင်သာယာ': 'လှိုင်သာယာ(အရှေ့)',
        'Royal': 'သန်လျင်',
        'ဂိတ်ချ': 'Aungmingalar Highway' 
    }

    # 3. Bilingual mapping to match Waybill Dropdowns for frequent townships
    en_town_map = {
        'စမ်းချောင်း': 'Sanchaung', 'လှိုင်': 'Hlaing', 'ကျောက်တံတား': 'Kyauktada',
        'ဒေါပုံ': 'Dawbon', 'တောင်ဥက္ကလာပ': 'South Okkalapa', 'မြောက်ဥက္ကလာပ': 'North Okkalapa',
        'တာမွေ': 'Tamwe', 'ပန်းဘဲတန်း': 'Pabedan', 'ဗဟန်း': 'Bahan', 'အလုံ': 'Ahlone', 
        'လသာ': 'Latha', 'လမ်းမတော်': 'Lanmadaw', 'ရန်ကင်း': 'Yankin', 
        'သင်္ဃန်းကျွန်း': 'Thingangyun', 'ပုဇွန်တောင်': 'Pazundaung', 'ဗိုလ်တထောင်': 'Botahtaung',
        'အင်းစိန်': 'Insein', 'မရမ်းကုန်း': 'Mayangone', 'မင်္ဂလာဒုံ': 'Mingaladon',
        'သာကေတ': 'Thaketa', 'ရွှေပြည်သာ': 'Shwepyithar', 'သန်လျင်': 'Thanlyin',
        'ကြည့်မြင်တိုင်': 'Kyeemyindaing', 'မင်္ဂလာတောင်ညွန့်': 'Mingalartaungnyunt', 'ဒဂုံ': 'Dagon',
        'လှိုင်သာယာ(အရှေ့)': 'Hlaingtharya', 'ဒဂုံမြို့သစ် (တောင်ပိုင်း)': 'Dagon Myothit (South)',
        'ဒဂုံမြို့သစ် (မြောက်ပိုင်း)': 'Dagon Myothit (North)', 'ဒဂုံမြို့သစ် (အရှေ့ပိုင်း)': 'Dagon Myothit (East)',
        'ဒဂုံမြို့သစ် (ဆိပ်ကမ်း)': 'Dagon Myothit (Seikkan)'
    }

    print("Processing rows and mapping postal codes...")
    output_rows = []
    
    for _, row in inbound_df.iterrows():
        # Get raw town and apply alias corrections
        raw_town = str(row.get('Recipient Town', '')).strip()
        official_town = town_aliases.get(raw_town, raw_town)
        
        postal_code = ""
        region_str = ""
        tsp_str = ""
        
        # Search for Township in postal codes
        matches = pc_df[pc_df['Township'].str.contains(official_town, na=False, regex=False)]
        
        if not matches.empty:
            match_row = matches.iloc[0]
            postal_code = match_row['PostalCode']
            
            raw_region = match_row['Region']
            region_str = region_map.get(raw_region, raw_region)
            
            tsp_my = match_row['Township']
            
            # Format to bilingual string if English pair exists
            en_prefix = en_town_map.get(official_town, "")
            if en_prefix:
                tsp_str = f"{en_prefix} Township / {tsp_my}"
            else:
                tsp_str = tsp_my
                
        else:
            # Fallback for Region-level broad entries
            if raw_town == 'မန္တလေး':
                region_str = 'Mandalay Region / မန္တလေးတိုင်းဒေသကြီး'
            elif raw_town == 'နေပြည်တော်':
                region_str = 'Naypyitaw Union Territory / နေပြည်တော် (ပြည်ထောင်စုနယ်မြေ)'
            tsp_str = raw_town
        
        # Construct the exact columns expected in Waybill Generatetemplate
        new_row = {
            'Way ID / Pickup ID': row.get('Way ID', ''),
            'Merchant Name': row.get('Merchant', ''),
            'Receiver Name': row.get('Recipient name', ''),
            'Receiver Phone': row.get('Recipient Phone', ''),
            'City (Dropdown)': region_str,
            'Township (Dropdown)': tsp_str,
            'Ward / Village Tract (Dropdown)': '', 
            'Postal Code (Auto)': postal_code,
            'Receiver Address': row.get('Recipient address', ''),
            'Actual Weight (KG)': row.get('Weight', ''),
            'Service Type': 'STANDARD',
            'Payment Type': 'EXACT_COLLECTION_AMOUNT',
            'Item Price': parse_amount(row.get('Final COD')),
            'OS Set Price': parse_amount(row.get('Deli Fee (OS)')),
            'Merchant Tier': 'STANDARD',
            'မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\n(Township / Service Provider)': 'Britium Express' # Defaulting
        }
        output_rows.append(new_row)
        
    out_df = pd.DataFrame(output_rows)
    
    # Ensure column order matches Waybill template exactly
    out_columns = list(waybill_df.columns)
    if len(out_columns) > 0:
        out_df = out_df.reindex(columns=out_columns)

    out_df.to_excel(output_file, index=False)
    print(f"✅ Success! Created {len(out_df)} synced waybills in '{output_file}'.")

if __name__ == "__main__":
    convert_inbound_to_waybill()