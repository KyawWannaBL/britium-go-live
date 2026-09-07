import pandas as pd
import os

# Check for whichever file you actually saved
target_file = 'Merchant_Update.csv'
if not os.path.exists(target_file):
    target_file = 'Britium_Merchant_Master_Update_Template.csv'

if not os.path.exists(target_file):
    print("❌ Error: Could not find your saved CSV file in this folder.")
    exit()

df = pd.read_csv(target_file)
df = df.fillna('') 

sql_lines = ["-- Run this in Supabase SQL Editor to apply your updates"]

for _, row in df.iterrows():
    code = str(row['merchant_code']).replace("'", "''")
    name = str(row['merchant_name']).replace("'", "''")
    contact = str(row.get('contact_person', '')).replace("'", "''")
    phone = str(row.get('phone', '')).replace("'", "''")
    township = str(row.get('township', '')).replace("'", "''")
    address = str(row.get('address', '')).replace("'", "''")
    
    sql = f"UPDATE merchant_master SET merchant_name = '{name}', contact_person = '{contact}', phone_primary = '{phone}', township = '{township}', address_line_1 = '{address}' WHERE merchant_code = '{code}';"
    sql_lines.append(sql)

with open('update_merchants.sql', 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql_lines))

print(f"✅ Generated update_merchants.sql using {target_file}")
