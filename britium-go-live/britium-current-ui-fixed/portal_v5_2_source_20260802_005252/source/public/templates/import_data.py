import pandas as pd
import requests
import numpy as np

# Configuration
SUPABASE_URL = "https://dltavabvjwocknkyvwgz.supabase.co/rest/v1"
API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsdGF2YWJ2andvY2tua3l2d2d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTMxOTQsImV4cCI6MjA4NjY4OTE5NH0.7-9BK6L9dpCYIB-pp1WOeQxCI1DVxnSykoTRXNUHYIo" 

def upload_csv_to_supabase(table_name, csv_file):
    print(f"--- Starting upload for {table_name} ---")
    
    # Load and clean data
    df = pd.read_csv(csv_file)
    data = df.replace({np.nan: None}).to_dict(orient='records')
    
    # Prepare Headers
    headers = {
        "apikey": API_KEY,
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    
    # Upload
    url = f"{SUPABASE_URL}/{table_name}"
    response = requests.post(url, headers=headers, json=data)
    
    if response.status_code in [200, 201]:
        print(f"SUCCESS: Uploaded {len(data)} rows to {table_name}.")
    else:
        print(f"ERROR: {response.text}")

# Execution
if __name__ == "__main__":
    # Matches the exact filenames you found with 'ls *.csv'
    upload_csv_to_supabase('delivery_waybills', 'delivery_waybills.csv')
    upload_csv_to_supabase('be_customer_invoices', 'be_customer_invoices.csv')