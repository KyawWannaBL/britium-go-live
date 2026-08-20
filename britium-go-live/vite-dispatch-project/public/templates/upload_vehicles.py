import pandas as pd
import requests
import json
import numpy as np

# 1. Load the data
df = pd.read_csv('vehicles_rows.csv')

# 2. Prepare the data for JSON ingestion
# Replace NaNs with None so the JSON payload becomes 'null'
data = df.replace({np.nan: None}).to_dict(orient='records')

# 3. Handle JSON columns
# Ensure 'capacity' is either None or a parsed dictionary
for row in data:
    if row.get('capacity') and isinstance(row['capacity'], str):
        try:
            row['capacity'] = json.loads(row['capacity'])
        except:
            row['capacity'] = None

# 4. Upload to your Supabase Endpoint
SUPABASE_URL = "https://dltavabvjwocknkyvwgz.supabase.co/rest/v1/vehicles"
API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsdGF2YWJ2andvY2tua3l2d2d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTMxOTQsImV4cCI6MjA4NjY4OTE5NH0.7-9BK6L9dpCYIB-pp1WOeQxCI1DVxnSykoTRXNUHYIo" 
headers = {
    "apikey": API_KEY,
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates" # This makes it an 'upsert'
}

response = requests.post(SUPABASE_URL, headers=headers, json=data)

if response.status_code in [200, 201]:
    print("Upload successful!")
else:
    print(f"Failed: {response.text}")