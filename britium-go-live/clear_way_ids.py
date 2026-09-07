import pandas as pd
import os

# List of the files generating the pickup error
files_to_fix = [
    "06092026_inbound160.xlsx",
    "06092026_pending_rto_formatted_part1_Fixed.xlsx",
    "06092026_pending_rto_formatted_part2_Fixed.xlsx"
]

def clear_way_id_and_append_ref(row):
    way_id_col = 'Way ID / Pickup ID'
    # Handle slight column name variations between your inbound and pending files
    addr_col = 'Receiver Address' if 'Receiver Address' in row else 'Recipient address'
    
    way_id = str(row.get(way_id_col, '')).strip()
    addr = str(row.get(addr_col, '')).strip()
    
    # If an old Way ID exists, append it to the address and clear the ID column
    if way_id and way_id.upper() not in ['NAN', 'NONE', '']:
        row[addr_col] = f"{addr} [Ref: {way_id}]"
        row[way_id_col] = "" 
    return row

print("Processing files to clear ineligible pickups...")

for file in files_to_fix:
    if os.path.exists(file):
        try:
            df = pd.read_excel(file)
            df = df.apply(clear_way_id_and_append_ref, axis=1)
            
            output_name = file.replace(".xlsx", "_Cleared.xlsx")
            df.to_excel(output_name, index=False)
            print(f"✅ Processed {file} -> Saved as {output_name}")
        except Exception as e:
            print(f"❌ Error processing {file}: {e}")
    else:
        print(f"⚠️ File not found (skipping): {file}")