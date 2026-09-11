import pandas as pd
import requests
import json
import numpy as np

# 1. Load your CSV
df = pd.read_csv('delivery_waybills.csv')

# 2. Clean Data: Replace NaNs with None for JSON compatibility
data = df.replace({np.nan: None}).to_dict(orient='records')

# 3. Handle JSONB columns specifically
# Identify columns that are JSONB based on your schema
jsonb_cols = ['payload', 'metadata'] # Add any other jsonb columns here
for row in data:
    for col in jsonb_cols:
        if row.get(col) and isinstance(row[col], str):
            try:
                row[col] = json.loads(row[col])
            except:
                row[col] = {}

# 4. Upload via Supabase API
SUPABASE_URL = "https://dltavabvjwocknkyvwgz.supabase.co/rest/v1/delivery_waybills"
API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsdGF2YWJ2andvY2tua3l2d2d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTMxOTQsImV4cCI6MjA4NjY4OTE5NH0.7-9BK6L9dpCYIB-pp1WOeQxCI1DVxnSykoTRXNUHYIo" 

headers = {
    "apikey": API_KEY,
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

response = requests.post(SUPABASE_URL, headers=headers, json=data)

if response.status_code in [200, 201]:
    print("Waybill upload successful!")
else:
    print(f"Failed: {response.text}")