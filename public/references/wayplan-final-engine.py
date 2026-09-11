import pandas as pd
import numpy as np
import math
import glob
import os
import re
import time

# ==========================================
# 1. BILINGUAL LOGISTICS CONFIGURATION
# ==========================================
TOWN_CONFIG = {
    # == Ahlone Branch (Bicycle Riders) ==
    'လမ်းမတော်': 'AHLONE', 'lanmadaw': 'AHLONE',
    'လသာ': 'AHLONE', 'latha': 'AHLONE',
    'ပန်းဘဲတန်း': 'AHLONE', 'pabedan': 'AHLONE',
    'ကျောက်တံတား': 'AHLONE', 'kyauktada': 'AHLONE', 'kyauktadar': 'AHLONE',
    'ဗိုလ်တထောင်': 'AHLONE', 'botahtaung': 'AHLONE', 'botataung': 'AHLONE',
    'ပုဇွန်တောင်': 'AHLONE', 'pazundaung': 'AHLONE',
    'အလုံ': 'AHLONE', 'ahlone': 'AHLONE', 'ahlon': 'AHLONE',
    'ကြည့်မြင်တိုင်': 'AHLONE', 'kyimyindaing': 'AHLONE', 'kyeemyindaing': 'AHLONE',
    'စမ်းချောင်း': 'AHLONE', 'sanchaung': 'AHLONE',
    
    # == Van 1 (Inner Central & East) ==
    'ဒဂုံ': 'VAN1', 'dagon': 'VAN1',
    'ကမာရွတ်': 'VAN1', 'kamayut': 'VAN1', 'kamaryut': 'VAN1',
    'ဗဟန်း': 'VAN1', 'bahan': 'VAN1',
    'မင်္ဂလာတောင်ညွန့်': 'VAN1', 'mingalataungnyunt': 'VAN1', 'mingalartaungnyunt': 'VAN1',
    'တာမွေ': 'VAN1', 'tamwe': 'VAN1', 'tarmwe': 'VAN1',
    
    # == Van 2 (North & West Industrial) ==
    'လှိုင်': 'VAN2', 'hlaing': 'VAN2',
    'မရမ်းကုန်း': 'VAN2', 'mayangone': 'VAN2', 'mayangon': 'VAN2',
    'အင်းစိန်': 'VAN2', 'insein': 'VAN2',
    'မင်္ဂလာဒုံ': 'VAN2', 'mingaladon': 'VAN2', 'mingalardon': 'VAN2',
    'ရွှေပြည်သာ': 'VAN2', 'shwepyitha': 'VAN2', 'shwepyithar': 'VAN2',
    'လှိုင်သာယာ': 'VAN2', 'hlaingtharyar': 'VAN2', 'hlaingthaya': 'VAN2',
    
    # == Van 3 (Eastern Suburbs) ==
    'ဒေါပုံ': 'VAN3', 'dawbon': 'VAN3',
    'သာကေတ': 'VAN3', 'thaketa': 'VAN3',
    'ရန်ကင်း': 'VAN3', 'yankin': 'VAN3',
    'မြောက်ဥက္ကလာပ': 'VAN3', 'northokkalapa': 'VAN3', 'nokkalapa': 'VAN3',
    'တောင်ဒဂုံ': 'VAN3', 'southdagon': 'VAN3', 'sdagon': 'VAN3',
    'ဒဂုံဆိပ်ကမ်း': 'VAN3', 'dagonseikkan': 'VAN3', 'dagonseikan': 'VAN3',
    
    # == HQ Bicycle Riders (High Density Zones) ==
    'မြောက်ဒဂုံ': 'HQRIDERS', 'northdagon': 'HQRIDERS', 'ndagon': 'HQRIDERS',
    'အရှေ့ဒဂုံ': 'HQRIDERS', 'eastdagon': 'HQRIDERS', 'edagon': 'HQRIDERS',
    'သင်္ဃန်းကျွန်း': 'HQRIDERS', 'thingangyun': 'HQRIDERS',
    'တောင်ဥက္ကလာပ': 'HQRIDERS', 'southokkalapa': 'HQRIDERS', 'sokkalapa': 'HQRIDERS'
}

def clean_sheet_name(name):
    return re.sub(r'[\[\]\:\*\?\/\\]', '', name)[:31]

# ==========================================
# 2. OPTIMIZER ENGINE
# ==========================================
def run_optimizer():
    # --- AUTO-CLEAN OLD OUTPUTS ---
    for old_file in glob.glob('*Manifest_Print_Ready*.html') + glob.glob('Final_Delivery_Way_List*.xlsx'):
        try: os.remove(old_file)
        except: pass

    # --- STRICT RAW DATA SEARCH (Supports both .xlsx and .csv) ---
    target_files = [f for f in glob.glob('*Delivery_Way_List*.*') if not f.startswith('Final_') and f.endswith(('.xlsx', '.csv'))]
    if not target_files: 
        return print("❌ Error: No raw 'Delivery_Way_List' file (Excel or CSV) found in folder.")
    
    target_file = target_files[0]
    print(f"📄 Analyzing File: {target_file}...")

    is_csv = target_file.lower().endswith('.csv')

    # --- DYNAMIC HEADER SEARCH ---
    try:
        if is_csv:
            raw_df = pd.read_csv(target_file, header=None, encoding='utf-8')
        else:
            raw_df = pd.read_excel(target_file, header=None)
    except Exception as e:
        return print(f"❌ Error loading file: {e}")

    header_idx = 0
    for i, row in raw_df.iterrows():
        row_vals = [re.sub(r'\s+', '', str(val).lower()) for val in row.values]
        if 'wayid' in row_vals or 'way id' in row_vals:
            header_idx = i
            break
    
    if is_csv:
        df = pd.read_csv(target_file, skiprows=header_idx, encoding='utf-8')
    else:
        df = pd.read_excel(target_file, skiprows=header_idx)

    # --- AGGRESSIVE COLUMN TRANSLATOR ---
    df.columns = [re.sub(r'\s+', '', str(c).lower()) for c in df.columns]
    mapping = {
        'wayid': 'way id', 
        'အမည်(name)': 'recipient name', 
        'recipientname': 'recipient name',
        'လက်ခံမည့်သူအမည်': 'recipient name',
        'မြို့နယ်': 'town', 
        'town': 'town', 
        'လိပ်စာ': 'recipient address', 
        'recipientaddress': 'recipient address', 
        'ပစ္စည်းတန်ဖိုး': 'item price', 
        'itemprice': 'item price', 
        'ပို့ဆောင်ခ': 'delivery charges', 
        'deliverycharges': 'delivery charges', 
        'ဖုန်းနံပါတ်': 'recipient phone', 
        'ဖုန်း': 'recipient phone', 
        'recipientphone': 'recipient phone', 
        'အလေးချိန်': 'weight', 
        'weight': 'weight', 
        'အလေးချိန်ပိုကြေး': 'weight charges', 
        'weightcharges': 'weight charges',
        'os': 'shop name'
    }
    df.rename(columns=mapping, inplace=True)

    required = ['way id', 'recipient name', 'town', 'recipient address', 'item price', 'delivery charges']
    if any(c not in df.columns for c in required):
        return print(f"❌ Error: Could not map columns. Found: {list(df.columns)}")

    # Add missing columns safely
    for col in ['weight', 'weight charges', 'recipient phone']:
        if col not in df.columns: 
            df[col] = 0 if 'weight' in col else ""

    # Normalization
    df['item price'] = pd.to_numeric(df['item price'], errors='coerce').fillna(0)
    df['delivery charges'] = pd.to_numeric(df['delivery charges'], errors='coerce').fillna(0)
    df['weight'] = pd.to_numeric(df['weight'], errors='coerce').fillna(0)
    df['weight charges'] = pd.to_numeric(df['weight charges'], errors='coerce').fillna(0)
    df['total_cod'] = df['item price'] + df['delivery charges'] + df['weight charges']
    
    # Strip spaces and lowercase the actual data inside the Town column to match dictionary
    df['town_clean'] = df['town'].fillna("").astype(str).str.lower().apply(lambda x: re.sub(r'\s+', '', x))

    # Identify Highway Drop-offs
    hw_kws = ['ဒဂုံဧရာ', 'လှိုင်သာယာအဝေးပြေး', 'အောင်မင်္ဂလာ', 'မြောက်ဥက္ကလာအဝေးပြေး', 'aungmingalar', 'dagonayar', 'highway']
    df['is_highway'] = df.apply(lambda row: True if any(kw in row['town_clean'] or kw in str(row['recipient address']).lower().replace(" ", "") for kw in hw_kws) else False, axis=1)

    # --- ROUTE ASSIGNMENT ---
    def determine_route(row):
        t = row['town_clean']
        addr = str(row['recipient address']).lower().replace(" ", "")
        
        if row['is_highway']:
            if any(kw in t or kw in addr for kw in ['ဒဂုံဧရာ', 'လှိုင်သာယာအဝေးပြေး', 'dagonayar']): return 'Van 2 (North-West & Highway Drop)'
            return 'Van 3 (East & Highway Drop)'
        
        grp = TOWN_CONFIG.get(t, 'OUT_OF_SERVICE')
        
        if grp == 'OUT_OF_SERVICE':
            if 'hlaingtharyar' in t or 'shwepyitha' in t or 'insein' in t: return 'Van 2 (North-West & Highway Drop)'
            if 'yankin' in t or 'thaketa' in t or 'dawbon' in t: return 'Van 3 (East & Highway Drop)'
            if 'thingangyun' in t or 'northdagon' in t or 'eastdagon' in t: return 'HQ Bicycle Rider Pool'
            if 'southdagon' in t or 'dagonseikkan' in t: return 'Van 3 (East & Highway Drop)'
        
        if grp == 'AHLONE': return 'Ahlone Branch Bicycle Rider'
        if grp == 'HQRIDERS': return 'HQ Bicycle Rider Pool'
        if grp == 'VAN1': return 'Van 1 (Central-East)'
        if grp == 'VAN2': return 'Van 2 (North-West & Highway Drop)'
        if grp == 'VAN3': return 'Van 3 (East & Highway Drop)'
        return 'OUT_OF_SERVICE'

    df['route_id'] = df.apply(determine_route, axis=1)

    # Distribute HQ Pool
    hq_indices = df[df['route_id'] == 'HQ Bicycle Rider Pool'].index
    if not hq_indices.empty:
        n = math.ceil(len(hq_indices) / 6)
        riders = [f'HQ Bicycle Rider {i+1}' for i in range(6) for _ in range(n)]
        df.loc[hq_indices, 'route_id'] = riders[:len(hq_indices)]

    # ==========================================
    # 3. WAY CONSOLIDATION (NEW LOGIC)
    # ==========================================
    # We sort the dataframe to group identical addresses/customers together within their assigned route.
    # Sorting hierarchy: Route -> Township -> Recipient Phone -> Recipient Name
    df.sort_values(by=['route_id', 'town', 'recipient phone', 'recipient name'], 
                   na_position='last', 
                   inplace=True)
    
    # Reset the index so the sequential numbering (စဉ်) in the HTML export remains clean
    df.reset_index(drop=True, inplace=True)


    # --- TERMINAL DASHBOARD ---
    print("\n📦 ROUTE ASSIGNMENT SUMMARY:")
    print("---------------------------------")
    print(df['route_id'].value_counts().to_string())
    print("---------------------------------\n")

    ts_print = time.strftime("%d/%m/%Y")
    file_ts_excel = time.strftime("Final_Delivery_Way_List%Y-%b-%d %I_%M %p.xlsx")
    file_ts_html = time.strftime("Manifest_Print_Ready_%H%M%S.html")

    # ==========================================
    # 4. HTML & EXCEL GENERATION
    # ==========================================
    html_out = """
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Pyidaungsu&display=swap');
            body { font-family: 'Pyidaungsu', sans-serif; font-size: 11px; margin: 0; background: #eee; }
            .page { width: 210mm; min-height: 297mm; padding: 10mm; margin: 5mm auto; background: white; box-sizing: border-box; page-break-after: always; position: relative; }
            .title { text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 15px; text-decoration: underline; }
            .meta-table { width: 100%; font-weight: bold; font-size: 12px; margin-bottom: 10px; border-collapse: collapse; }
            .meta-table td { padding: 4px; border: 1px solid #ddd; }
            .m-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 15px; }
            .m-table th { background: #D7E4BC; border: 1px solid black; padding: 6px; font-size: 11px; text-align: center; }
            .m-table td { border: 1px solid black; padding: 5px; font-size: 11px; vertical-align: middle; word-wrap: break-word; overflow-wrap: break-word; }
            .footer { font-size: 12px; font-weight: bold; line-height: 1.8; margin-top: 15px; }
            .flex { display: flex; justify-content: space-between; }
            .sign-box { text-align: center; width: 22%; font-size: 11px; }
            .sum-row td { background: #f9f9f9; font-weight: bold; }
            @media print { body { background: white; } .page { margin: 0; padding: 10mm; border: none; box-shadow: none; } }
        </style>
    </head>
    <body>
    """

    writer = pd.ExcelWriter(file_ts_excel, engine='xlsxwriter')
    wb = writer.book
    h_fmt = wb.add_format({'bold': True, 'bg_color': '#D7E4BC', 'border': 1, 'align': 'center'})

    for route in sorted(df['route_id'].unique()):
        r_df = df[df['route_id'] == route].copy()
        
        # Calculate sums
        total_parcels = len(r_df)
        hw_count = r_df['is_highway'].sum()
        normal_count = total_parcels - hw_count
        sum_item = r_df['item price'].sum()
        sum_deli = r_df['delivery charges'].sum()
        sum_weight_c = r_df['weight charges'].sum()
        sum_total_cod = r_df['total_cod'].sum()
        
        if route != 'OUT_OF_SERVICE':
            html_out += f"""
            <div class="page">
                <div class="title">Manifest: {route}</div>
                <table class="meta-table">
                    <tr>
                        <td style="width:38%">Date: {ts_print}</td>
                        <td style="width:38%">ယာဉ်မောင်း/ပို့ဆောင်သူ: ___________________</td>
                        <td style="width:24%">ပုံမှန်ပို့ဆောင်ရမည့်အရေအတွက်: {normal_count}</td>
                    </tr>
                    <tr>
                        <td>ကုန်လှောင်ရုံတာဝန်ခံ: ___________________</td>
                        <td>ယာဉ်နောက်လိုက်: ___________________</td>
                        <td>အဝေးပြေးဂိတ်ပို့ရန်အရေအတွက်: {hw_count}</td>
                    </tr>
                    <tr>
                        <td>ကုန်လှောင်ရုံလက်ထောက်: ___________________</td>
                        <td>ယာဉ်အမှတ် (Plate No): ___________________</td>
                        <td>စုစုပေါင်းပါဆယ်အရေအတွက်: {total_parcels}</td>
                    </tr>
                    <tr>
                        <td colspan="3">ငွေအကြွေထုတ်ယူမှုပမာဏ: ___________________</td>
                    </tr>
                </table>
                <table class="m-table">
                    <thead>
                        <tr>
                            <th style="width:10%">Way ID</th><th style="width:3%">စဉ်</th><th style="width:11%">အမည်</th>
                            <th style="width:8%">မြို့နယ်</th><th style="width:18%">လိပ်စာ</th><th style="width:5%">အလေးချိန်<br>(kg)</th>
                            <th style="width:7%">ပစ္စည်းတန်ဖိုး</th><th style="width:6%">ပို့ဆောင်ခ</th><th style="width:6%">အလေးချိန်<br>ကျသင့်ငွေ</th>
                            <th style="width:8%">စုစုပေါင်း<br>(Total)</th><th style="width:10%">ဖုန်း</th><th style="width:8%">မှတ်ချက်</th>
                        </tr>
                    </thead>
                    <tbody>"""
            
            for i, row in enumerate(r_df.to_dict('records')):
                html_out += f"""
                    <tr>
                        <td style="text-align:center">{row['way id']}</td>
                        <td style="text-align:center">{i+1}</td>
                        <td>{row['recipient name']}</td>
                        <td style="text-align:center">{row['town']}</td>
                        <td>{row['recipient address']}</td>
                        <td style="text-align:center">{row['weight']}</td>
                        <td style="text-align:right">{int(row['item price']):,}</td>
                        <td style="text-align:right">{int(row['delivery charges']):,}</td>
                        <td style="text-align:right">{int(row['weight charges']):,}</td>
                        <td style="text-align:right; font-weight:bold;">{int(row['total_cod']):,}</td>
                        <td style="text-align:center">{row['recipient phone']}</td>
                        <td></td>
                    </tr>"""
            
            html_out += f"""
                    <tr class="sum-row">
                        <td colspan="6" style="text-align:right;">Trip Totals (စုစုပေါင်း):</td>
                        <td style="text-align:right;">{int(sum_item):,}</td>
                        <td style="text-align:right;">{int(sum_deli):,}</td>
                        <td style="text-align:right;">{int(sum_weight_c):,}</td>
                        <td style="text-align:right; color:red;">{int(sum_total_cod):,}</td>
                        <td colspan="2"></td>
                    </tr>
                    </tbody></table>
                <div class="footer">
                    <div class="flex"><div>ကောက်ခံရရှိငွေ (Cash Collected): ______________________</div><div>Mobile Banking: _________________</div></div>
                    <div>စုစုပေါင်း (Total Collected): ______________________</div>
                    
                    <div class="flex" style="margin-top:20px;">
                        <div class="sign-box">______________________<br>ယာဉ်မောင်း/ပို့ဆောင်သူ လက်မှတ်</div>
                        <div class="sign-box">______________________<br>ယာဉ်နောက်လိုက် လက်မှတ်</div>
                        <div class="sign-box">______________________<br>ကုန်လှောင်ရုံတာဝန်ခံ လက်မှတ်</div>
                        <div class="sign-box">______________________<br>ကုန်လှောင်ရုံလက်ထောက်</div>
                    </div>
                    <div class="flex" style="margin-top:20px; padding: 0 50px;">
                        <div class="sign-box">______________________<br>Operation (Ack)</div>
                        <div class="sign-box">______________________<br>Finance (Received)</div>
                        <div class="sign-box">______________________<br>Finance (Ack)</div>
                    </div>
                </div>
            </div>"""

        # EXCEL EXPORT (Including Out of Service)
        sheet_name = clean_sheet_name(route)
        export_df = r_df[['way id', 'recipient name', 'town', 'recipient address', 'weight', 'item price', 'delivery charges', 'weight charges', 'total_cod', 'recipient phone']].copy()
        export_df.columns = ['Way ID', 'Name', 'Township', 'Address', 'Weight (kg)', 'Item Price', 'Deli Charges', 'Weight Charges', 'Total Collective Amount', 'Phone']
        export_df.to_excel(writer, sheet_name=sheet_name, index=False)
        
        ws = writer.sheets[sheet_name]
        for col_num, value in enumerate(export_df.columns.values):
            ws.write(0, col_num, value, h_fmt)
        ws.set_column('A:B', 15); ws.set_column('D:D', 30); ws.set_column('I:I', 20)

    with open(file_ts_html, "w", encoding="utf-8") as f:
        f.write(html_out + "</body></html>")
    
    writer.close()
        
    print(f"🖨️  HTML Generated: {file_ts_html}")
    print(f"📊 Excel Generated: {file_ts_excel}")
    print(f"✨ SUCCESS! Professional Wayplan is ready.")

if __name__ == "__main__":
    run_optimizer()