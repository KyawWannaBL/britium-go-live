import pandas as pd
import os

def fix_compilation():
    file_path = "06092026_inboundlist_FinalCompilation_2.xlsx"
    output_path = "06092026_inboundlist_FinalCompilation_2_Fixed.xlsx"
    postal_file = "Myanmar_Postalcodes_All_MM.xlsx"

    print(f"Reading {file_path}...")
    try:
        df = pd.read_excel(file_path)
    except FileNotFoundError:
        print(f"❌ Error: {file_path} not found in this folder.")
        return

    print("Loading postal codes...")
    try:
        pc_xls = pd.ExcelFile(postal_file)
        all_pc_df = []
        for sheet in pc_xls.sheet_names:
            df_pc = pd.read_excel(pc_file, sheet_name=sheet)
            df_pc.columns = ['Region', 'Township', 'Ward', 'PostalCode']
            all_pc_df.append(df_pc)
        pc_df = pd.concat(all_pc_df, ignore_index=True)
    except Exception as e:
        print(f"⚠️ Warning: Could not load postal codes: {e}")
        pc_df = pd.DataFrame(columns=['Region', 'Township', 'Ward', 'PostalCode'])

    # Standard Region Mapping
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

    # English Prefix Mapping for Portal Dropdowns
    en_town_map = {
        'စမ်းချောင်း': 'Sanchaung', 'လှိုင်': 'Hlaing', 'ကျောက်တံတား': 'Kyauktada',
        'ဒေါပုံ': 'Dawbon', 'တောင်ဥက္ကလာပ': 'South Okkalapa', 'မြောက်ဥက္ကလာပ': 'North Okkalapa',
        'တာမွေ': 'Tamwe', 'ပန်းဘဲတန်း': 'Pabedan', 'ဗဟန်း': 'Bahan', 'အလုံ': 'Ahlone', 
        'လသာ': 'Latha', 'လမ်းမတော်': 'Lanmadaw', 'ရန်ကင်း': 'Yankin', 
        'သင်္ဃန်းကျွန်း': 'Thingangyun', 'ပုဇွန်တောင်': 'Pazundaung', 'ဗိုလ်တထောင်': 'Botahtaung',
        'အင်းစိန်': 'Insein', 'မရမ်းကုန်း': 'Mayangone', 'မင်္ဂလာဒုံ': 'Mingaladon',
        'သာကေတ': 'Thaketa', 'ရွှေပြည်သာ': 'Shwepyithar', 'သန်လျင်': 'Thanlyin',
        'ကြည့်မြင်တိုင်': 'Kyeemyindaing', 'ကြည့်မြင်တိုင်': 'Kyeemyindaing',
        'မင်္ဂလာတောင်ညွန့်': 'Mingalartaungnyunt', 'မင်္ဂလာတောင်ညွန့်': 'Mingalartaungnyunt',
        'ဒဂုံ': 'Dagon', 'ကမာရွတ်': 'Kamayut',
        'လှိုင်သာယာ': 'Hlaingtharya', 'တောင်ဒဂုံ': 'Dagon Myothit (South)',
        'မြောက်ဒဂုံ': 'Dagon Myothit (North)', 'အရှေ့ဒဂုံ': 'Dagon Myothit (East)',
        'ဒဂုံဆိပ်ကမ်း': 'Dagon Myothit (Seikkan)',
        'ချမ်းမြသာစည်': 'Chanmyathazi', 'မဟာအောင်မြေ': 'Mahaaungmyay', 'အောင်မြေသာစံ': 'Aungmyaythazan',
        'ချမ်းအေးသာစံ': 'Chanayethazan', 'ပြည်ကြီးတံခွန်': 'Pyigyidagun', 'အမရပူရ': 'Amarapura',
        'ဇမ္ဗူသီရိ': 'Zabuthiri', 'ဇေယျာသီရိ': 'Zeyarthiri', 'ပုဗ္ဗသီရိ': 'Pobbathiri',
        'ဥတ္တရသီရိ': 'Ottarathiri', 'ဒက္ခိဏသီရိ': 'Dekkhinathiri', 'ပျဉ်းမနား': 'Pyinmana', 'လယ်ဝေး': 'Lewe'
    }
    
    def extract_town_from_address(addr):
        if not isinstance(addr, str): return ""
        for town in en_town_map.keys():
            if town in addr: return town
        if 'မန္တလေး' in addr: return 'မန္တလေး'
        if 'နေပြည်တော်' in addr: return 'နေပြည်တော်'
        return ""

    print("Applying business rules and data corrections...")
    for idx, row in df.iterrows():
        # 1. Fix missing/green Location Data
        if pd.isna(row.get('City (Dropdown)')) or str(row.get('City (Dropdown)')).strip() == '':
            addr = str(row.get('Receiver Address', ''))
            extracted_town = extract_town_from_address(addr)
            
            if extracted_town:
                # Find matching row in postal database
                matches = pc_df[pc_df['Township'].str.contains(extracted_town, na=False, regex=False)]
                if not matches.empty and extracted_town not in ['နေပြည်တော်', 'မန္တလေး']:
                    match_row = matches.iloc[0]
                    
                    df.at[idx, 'Postal Code (Auto)'] = match_row['PostalCode']
                    df.at[idx, 'City (Dropdown)'] = region_map.get(match_row['Region'], match_row['Region'])
                    
                    tsp_my = match_row['Township']
                    en_prefix = en_town_map.get(extracted_town, "")
                    if en_prefix:
                        df.at[idx, 'Township (Dropdown)'] = f"{en_prefix} Township / {tsp_my}"
                    else:
                        df.at[idx, 'Township (Dropdown)'] = tsp_my
                else:
                    # Regional fallbacks
                    if extracted_town == 'မန္တလေး':
                        df.at[idx, 'City (Dropdown)'] = 'Mandalay Region / မန္တလေးတိုင်းဒေသကြီး'
                    elif extracted_town == 'နေပြည်တော်':
                        df.at[idx, 'City (Dropdown)'] = 'Naypyitaw Union Territory / နေပြည်တော် (ပြည်ထောင်စုနယ်မြေ)'

        # 2. Update Payment Type
        merchant = str(row.get('Merchant Name', '')).upper()
        if 'DKS' in merchant:
            df.at[idx, 'Payment Type'] = 'EXACT_COLLECTION_AMOUNT'
        else:
            df.at[idx, 'Payment Type'] = 'ITEM_PRICE_AND_DELIVERY_CHARGES'
            
        # 3. Update Merchant Tier & Service Type
        df.at[idx, 'Merchant Tier'] = 'STANDARD'
        df.at[idx, 'Service Type'] = 'STANDARD'
        
        # 4. Enforce Service Provider text if blank
        provider_col = 'မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\n(Township / Service Provider)'
        if provider_col in df.columns:
            if pd.isna(row.get(provider_col)) or str(row.get(provider_col)).strip() == '':
                df.at[idx, provider_col] = 'Britium Express'

    df.to_excel(output_path, index=False)
    print(f"✅ Success! Generated upload-ready file: {output_path}")

if __name__ == "__main__":
    fix_compilation()