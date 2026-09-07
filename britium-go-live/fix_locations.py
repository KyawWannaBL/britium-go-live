import pandas as pd

file_path = "Britium_Consolidated_Location_Review_2026-09-07-01-59.xlsx"
output_path = "Britium_Consolidated_Location_Review_2026-09-07-01-59_Corrected.xlsx"

print("Loading location data...")
xls = pd.ExcelFile(file_path)
print(f"Detected sheets: {xls.sheet_names}")

# Automatically grab the first sheet regardless of its exact name
data_sheet = xls.sheet_names[0]
df = pd.read_excel(xls, sheet_name=data_sheet)

# Grab the second sheet for instructions if it exists
instructions_sheet = xls.sheet_names[1] if len(xls.sheet_names) > 1 else None
if instructions_sheet:
    instructions_df = pd.read_excel(xls, sheet_name=instructions_sheet)

# Approximate centroid coordinates for routing fallbacks
coords = {
    'သင်္ဃန်းကျွန်း': (16.8247, 96.1950),
    'စမ်းချောင်း': (16.8048, 96.1362),
    'ဗဟန်း': (16.8122, 96.1557),
    'ဒဂုံ': (16.7937, 96.1472),
    'ပန်းဘဲတန်း': (16.7766, 96.1551),
    'ဒေါပုံ': (16.7744, 96.1834),
    'အရှေ့ဒဂုံ': (16.8833, 96.2167),
    'Hlaingtharya(East) Township': (16.8778, 96.0622),
    'Hlaingtharya (West) Township': (16.8778, 96.0622),
    'တောင်ဒဂုံ': (16.8402, 96.2081),
    'မြောက်ဒဂုံ': (16.8683, 96.1839),
    'လှိုင်': (16.8418, 96.1264),
    'မရမ်းကုန်း': (16.8617, 96.1420),
    'တောင်ဥက္ကလာပ': (16.8398, 96.1873),
    'သာကေတ': (16.8048, 96.2120),
    'ဇေယျာသီရိ': (19.8329, 96.2847),
    'ဇမ္ဗူသီရိ': (19.7423, 96.1157),
    'ဥတ္တရသီရိ': (19.8290, 96.1186),
    'ပုဗ္ဗသီရိ': (19.8517, 96.1983),
    'ဒက္ခိဏသီရိ': (19.6800, 96.1311),
    'ပြည်ကြီးတံခွန်': (21.9333, 96.1000),
    'အောင်မြေသာစံ': (21.9961, 96.0950),
    'ချမ်းအေးသာစံ': (21.9790, 96.0963),
    'မဟာအောင်မြေ': (21.9610, 96.0963)
}

def apply_fixes(row):
    # If a pin was suggested by the system, accept it without review
    if pd.notna(row.get('Suggested Latitude')):
        row['Action'] = 'SKIP_REVIEW'
    else:
        # If no pin exists, inject the fallback township coordinate
        tsp = row.get('Township')
        if tsp in coords:
            row['Corrected Latitude'] = coords[tsp][0]
            row['Corrected Longitude'] = coords[tsp][1]
    return row

df = df.apply(apply_fixes, axis=1)

# Save both sheets exactly as the upload parser expects
with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    df.to_excel(writer, sheet_name=data_sheet, index=False)
    if instructions_sheet:
        instructions_df.to_excel(writer, sheet_name=instructions_sheet, index=False)

print(f"✅ Success! Corrected coordinates saved to: {output_path}")