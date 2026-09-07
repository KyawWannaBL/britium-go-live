import pandas as pd
import os

file1 = 'merchant_master_rows.csv'
file2 = 'be_merchant_master_rows.csv'

df1 = pd.read_csv(file1) if os.path.exists(file1) else pd.DataFrame()
df2 = pd.read_csv(file2) if os.path.exists(file2) else pd.DataFrame()

frames = []

if not df1.empty and 'merchant_code' in df1.columns:
    df1_clean = df1[['merchant_code', 'merchant_name', 'contact_person', 'phone_primary', 'township', 'address_line_1']].copy()
    df1_clean.rename(columns={'phone_primary': 'phone', 'address_line_1': 'address'}, inplace=True)
    frames.append(df1_clean)

if not df2.empty and 'merchant_code' in df2.columns:
    df2_clean = df2[['merchant_code', 'merchant_name', 'contact_phone', 'pickup_township', 'pickup_address']].copy()
    df2_clean.rename(columns={'contact_phone': 'phone', 'pickup_township': 'township', 'pickup_address': 'address'}, inplace=True)
    df2_clean['contact_person'] = ''
    frames.append(df2_clean)

if frames:
    combined_df = pd.concat(frames, ignore_index=True)
    combined_df = combined_df.dropna(subset=['merchant_code'])
    combined_df = combined_df.fillna('')
    final_df = combined_df.drop_duplicates(subset=['merchant_code'], keep='first')
    final_df = final_df.sort_values(by='merchant_code')
    
    output_file = 'Britium_Merchant_Master_Update_Template.csv'
    final_df.to_csv(output_file, index=False, encoding='utf-8-sig')
    print(f"✅ Successfully generated {output_file} with {len(final_df)} merchants.")
else:
    print("❌ Could not find valid merchant data in the CSV files.")