import pandas as pd
import os

files_to_fix = [
    "06092026_inbound160_Cleared.xlsx",
    "06092026_pending_rto_formatted_part1_Fixed_Cleared.xlsx",
    "06092026_pending_rto_formatted_part2_Fixed_Cleared.xlsx"
]

target_columns = [
    'Way ID / Pickup ID', 'Merchant Name', 'Receiver Name', 'Receiver Phone', 
    'City (Dropdown)', 'Township (Dropdown)', 'Ward / Village Tract (Dropdown)', 
    'Postal Code (Auto)', 'Receiver Address', 'Actual Weight (KG)', 
    'Service Type', 'Payment Type', 'Item Price', 'OS Set Price', 'Merchant Tier', 
    'မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\n(Township / Service Provider)'
]

print("Standardizing columns for portal upload...")

for file in files_to_fix:
    if os.path.exists(file):
        try:
            df = pd.read_excel(file)
            
            # Ensure the Receiver Address column has the exact expected name
            if 'Recipient address' in df.columns:
                df.rename(columns={'Recipient address': 'Receiver Address'}, inplace=True)
                
            # Inject the missing Service Provider column if it doesn't exist
            provider_col = 'မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\n(Township / Service Provider)'
            if provider_col not in df.columns:
                df[provider_col] = 'Britium Express'
                
            # Guarantee all 16 required columns exist in the exact order
            for col in target_columns:
                if col not in df.columns:
                    df[col] = ''
            df = df.reindex(columns=target_columns)
            
            df.to_excel(file, index=False)
            print(f"✅ Fixed columns in: {file}")
            
        except Exception as e:
            print(f"❌ Error processing {file}: {e}")
    else:
        print(f"⚠️ File not found (skipping): {file}")