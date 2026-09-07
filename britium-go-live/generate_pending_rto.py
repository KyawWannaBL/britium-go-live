import pandas as pd
import numpy as np

def parse_amount(val):
    if pd.isna(val) or str(val).strip() in ['-', '', 'nan']: 
        return 0
    try: 
        return int(float(str(val).replace(',', '').strip()))
    except ValueError: 
        return 0

def convert_pending_rto_to_waybill():
    # Explicitly list the columns expected by the Britium Express portal
    target_columns = [
        'Way ID / Pickup ID', 'Merchant Name', 'Receiver Name', 'Receiver Phone', 
        'City (Dropdown)', 'Township (Dropdown)', 'Ward / Village Tract (Dropdown)', 
        'Postal Code (Auto)', 'Recipient address', 'Actual Weight (KG)', 
        'Service Type', 'Payment Type', 'Item Price', 'OS Set Price', 'Merchant Tier', 
        'မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\n(Township / Service Provider)'
    ]

    # Load postal codes
    pc_file = "Myanmar_Postalcodes_All_MM.xlsx"
    pc_xls = pd.ExcelFile(pc_file)
    all_pc_df = []
    for sheet in pc_xls.sheet_names:
        df = pd.read_excel(pc_file, sheet_name=sheet)
        df.columns = ['Region', 'Township', 'Ward', 'PostalCode']
        all_pc_df.append(df)
    pc_df = pd.concat(all_pc_df, ignore_index=True)

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

    town_aliases = {
        'ကြည့်မြင်တိုင်': 'ကြည့်မြင်တိုင်', 'မင်္ဂလာတောင်ညွန့်': 'မင်္ဂလာတောင်ညွန့်',
        'တောင်ဒဂုံ': 'ဒဂုံမြို့သစ် (တောင်ပိုင်း)', 'အရှေ့ဒဂုံ': 'ဒဂုံမြို့သစ် (အရှေ့ပိုင်း)',
        'မြောက်ဒဂုံ': 'ဒဂုံမြို့သစ် (မြောက်ပိုင်း)', 'ဒဂုံဆိပ်ကမ်း': 'ဒဂုံမြို့သစ် (ဆိပ်ကမ်း)',
        'လှိုင်သာယာ': 'လှိုင်သာယာ(အရှေ့)', 'Royal': 'သန်လျင်', 'Royal Express': 'သန်လျင်',
        'ဂိတ်ချ': 'Aungmingalar Highway', '[ကမာရွတ်]': 'ကမာရွတ်', ' စမ်းချောင်း': 'စမ်းချောင်း'
    }

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
        'ဒဂုံမြို့သစ် (ဆိပ်ကမ်း)': 'Dagon Myothit (Seikkan)', 'ကမာရွတ်': 'Kamayut'
    }

    df_pending = pd.read_excel("06092026_pending&rto.xlsx").dropna(subset=['Way ID / Pickup ID'])

    output_rows = []
    for _, row in df_pending.iterrows():
        raw_town = str(row.get('City (Dropdown)', '')).strip()
        if raw_town in ['0', 'nan', 'None']:
            raw_town = ''
            
        official_town = town_aliases.get(raw_town, raw_town)
        addr = str(row.get('Township (Dropdown)', ''))
        
        if 'နေပြည်တော်' in addr and 'Naypyitaw' not in official_town:
            official_town = 'နေပြည်တော်'
        elif 'မန္တလေး' in addr and 'Mandalay' not in official_town:
            official_town = 'မန္တလေး'

        postal_code = ""
        region_str = ""
        tsp_str = ""
        
        matches = pc_df[pc_df['Township'].str.contains(official_town, na=False, regex=False)]
        
        if not matches.empty and official_town not in ['နေပြည်တော်', 'မန္တလေး']:
            match_row = matches.iloc[0]
            postal_code = match_row['PostalCode']
            raw_region = match_row['Region']
            region_str = region_map.get(raw_region, raw_region)
            tsp_my = match_row['Township']
            en_prefix = en_town_map.get(official_town, "")
            if en_prefix:
                tsp_str = f"{en_prefix} Township / {tsp_my}"
            else:
                tsp_str = tsp_my
        else:
            if official_town == 'မန္တလေး' or 'မန္တလေး' in addr:
                region_str = 'Mandalay Region / မန္တလေးတိုင်းဒေသကြီး'
            elif official_town == 'နေပြည်တော်' or 'နေပြည်တော်' in addr:
                region_str = 'Naypyitaw Union Territory / နေပြည်တော် (ပြည်ထောင်စုနယ်မြေ)'
            tsp_str = official_town
        
        # Payment Type Business Logic
        merchant_name = str(row.get('Merchant Name', ''))
        if 'GRS' in merchant_name.upper():
            payment_type = 'EXACT_COLLECTION_AMOUNT'
        else:
            payment_type = 'ITEM_PRICE_AND_DELIVERY_CHARGES'
        
        new_row = {
            'Way ID / Pickup ID': row.get('Way ID / Pickup ID', ''),
            'Merchant Name': merchant_name,
            'Receiver Name': row.get('Receiver Name', ''),
            'Receiver Phone': row.get('Receiver Phone', ''),
            'City (Dropdown)': region_str,
            'Township (Dropdown)': tsp_str,
            'Ward / Village Tract (Dropdown)': '', 
            'Postal Code (Auto)': postal_code,
            'Recipient address': addr,
            'Actual Weight (KG)': row.get('Weight', ''),
            'Service Type': 'STANDARD',
            'Payment Type': payment_type,
            'Item Price': parse_amount(row.get('Final COD')),
            'OS Set Price': parse_amount(row.get('Deli Fee (OS)')),
            'Merchant Tier': 'STANDARD',
            'မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\n(Township / Service Provider)': 'Britium Express'
        }
        output_rows.append(new_row)

    out_df = pd.DataFrame(output_rows)
    out_df = out_df.reindex(columns=target_columns)

    chunk_size = 160
    for i in range((len(out_df) // chunk_size) + 1):
        start = i * chunk_size
        end = start + chunk_size
        chunk = out_df.iloc[start:end]
        if not chunk.empty:
            fname = f"06092026_pending_rto_formatted_part1_Fixed.xlsx"
            chunk.to_excel(fname, index=False)
            print(f"✅ Generated {fname} with {len(chunk)} rows.")

if __name__ == "__main__":
    convert_pending_rto_to_waybill()