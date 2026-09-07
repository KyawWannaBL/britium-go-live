import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import pandas as pd
import re
import os

# --- CORE DICTIONARIES & MAPPINGS ---
COORDS = {
    'သင်္ဃန်းကျွန်း': (16.8247, 96.1950), 'စမ်းချောင်း': (16.8048, 96.1362), 'ဗဟန်း': (16.8122, 96.1557),
    'ဒဂုံ': (16.7937, 96.1472), 'ပန်းဘဲတန်း': (16.7766, 96.1551), 'ဒေါပုံ': (16.7744, 96.1834),
    'အရှေ့ဒဂုံ': (16.8833, 96.2167), 'လှိုင်သာယာ': (16.8778, 96.0622), 'တောင်ဒဂုံ': (16.8402, 96.2081),
    'မြောက်ဒဂုံ': (16.8683, 96.1839), 'လှိုင်': (16.8418, 96.1264), 'မရမ်းကုန်း': (16.8617, 96.1420),
    'တောင်ဥက္ကလာပ': (16.8398, 96.1873), 'သာကေတ': (16.8048, 96.2120), 'ဇေယျာသီရိ': (19.8329, 96.2847),
    'ဇမ္ဗူသီရိ': (19.7423, 96.1157), 'ဥတ္တရသီရိ': (19.8290, 96.1186), 'ပုဗ္ဗသီရိ': (19.8517, 96.1983),
    'ဒက္ခိဏသီရိ': (19.6800, 96.1311), 'ပြည်ကြီးတံခွန်': (21.9333, 96.1000), 'အောင်မြေသာစံ': (21.9961, 96.0950),
    'ချမ်းအေးသာစံ': (21.9790, 96.0963), 'မဟာအောင်မြေ': (21.9610, 96.0963), 'မြောက်ဥက္ကလာပ': (16.9077, 96.1683),
    'ရွှေပြည်သာ': (16.9667, 96.1083), 'လမ်းမတော်': (16.7770, 96.1438), 'ကျောက်တံတား': (16.7731, 96.1606),
    'ကမာရွတ်': (16.8264, 96.1308), 'အင်းစိန်': (16.8920, 96.1009), 'မင်္ဂလာဒုံ': (16.9602, 96.1481),
    'ပုဇွန်တောင်': (16.7865, 96.1772), 'ဗိုလ်တထောင်': (16.7725, 96.1712), 'မင်္ဂလာတောင်ညွန့်': (16.7937, 96.1661),
    'ကြည့်မြင်တိုင်': (16.8056, 96.1219), 'အလုံ': (16.7867, 96.1314), 'တာမွေ': (16.8083, 96.1758),
    'လသာ': (16.7772, 96.1472), 'ရန်ကင်း': (16.8378, 96.1664), 'သန်လျင်': (16.7628, 96.2483),
    'ဒဂုံဆိပ်ကမ်း': (16.8304, 96.2307), 'ပျဉ်းမနား': (19.7348, 96.2132), 'ချမ်းမြသာစည်': (21.9389, 96.0964),
    'ဒဂုံမြို့သစ် (တောင်ပိုင်း)': (16.8402, 96.2081), 'ဒဂုံမြို့သစ် (မြောက်ပိုင်း)': (16.8683, 96.1839),
    'ဒဂုံမြို့သစ် (အရှေ့ပိုင်း)': (16.8833, 96.2167), 'ဒဂုံမြို့သစ် (ဆိပ်ကမ်း)': (16.8304, 96.2307)
}

EN_TOWN_MAP = {
    'စမ်းချောင်း': 'Sanchaung', 'လှိုင်': 'Hlaing', 'ကျောက်တံတား': 'Kyauktada', 'ဒေါပုံ': 'Dawbon', 
    'တောင်ဥက္ကလာပ': 'South Okkalapa', 'မြောက်ဥက္ကလာပ': 'North Okkalapa', 'တာမွေ': 'Tamwe', 
    'ပန်းဘဲတန်း': 'Pabedan', 'ဗဟန်း': 'Bahan', 'အလုံ': 'Ahlone', 'လသာ': 'Latha', 'လမ်းမတော်': 'Lanmadaw', 
    'ရန်ကင်း': 'Yankin', 'သင်္ဃန်းကျွန်း': 'Thingangyun', 'ပုဇွန်တောင်': 'Pazundaung', 'ဗိုလ်တထောင်': 'Botahtaung',
    'အင်းစိန်': 'Insein', 'မရမ်းကုန်း': 'Mayangone', 'မင်္ဂလာဒုံ': 'Mingaladon', 'သာကေတ': 'Thaketa', 
    'ရွှေပြည်သာ': 'Shwepyithar', 'သန်လျင်': 'Thanlyin', 'ကြည့်မြင်တိုင်': 'Kyeemyindaing', 
    'မင်္ဂလာတောင်ညွန့်': 'Mingalartaungnyunt', 'ဒဂုံ': 'Dagon', 'ကမာရွတ်': 'Kamayut', 'လှိုင်သာယာ': 'Hlaingtharya', 
    'တောင်ဒဂုံ': 'Dagon Myothit (South)', 'မြောက်ဒဂုံ': 'Dagon Myothit (North)', 'အရှေ့ဒဂုံ': 'Dagon Myothit (East)',
    'ဒဂုံဆိပ်ကမ်း': 'Dagon Myothit (Seikkan)', 'ချမ်းမြသာစည်': 'Chanmyathazi', 'မဟာအောင်မြေ': 'Mahaaungmyay', 
    'အောင်မြေသာစံ': 'Aungmyaythazan', 'ချမ်းအေးသာစံ': 'Chanayethazan', 'ပြည်ကြီးတံခွန်': 'Pyigyidagun', 
    'အမရပူရ': 'Amarapura', 'ပျဉ်းမနား': 'Pyinmana'
}

class BritiumDailyOps:
    def __init__(self, root):
        self.root = root
        self.root.title("Britium Express - Daily Operations Suite")
        self.root.geometry("600x450")
        # ADD THIS LINE TO KEEP THE APP FLOATING OVER YOUR BROWSER
        self.root.attributes('-topmost', True)
        self.style = ttk.Style()
        self.style.theme_use('clam')
        
        # Tabs
        self.notebook = ttk.Notebook(root)
        self.notebook.pack(fill='both', expand=True, padx=10, pady=10)
        
        self.tab_manifest = ttk.Frame(self.notebook)
        self.tab_review = ttk.Frame(self.notebook)
        
        self.notebook.add(self.tab_manifest, text="1. Manifest Processing")
        self.notebook.add(self.tab_review, text="2. Location Review Fixer")
        
        self.build_manifest_tab()
        self.build_review_tab()
        
        self.postal_df = None
        self.load_postal_database()
      
    def load_postal_database(self):
        db_path = "Myanmar_Postalcodes_All_MM.xlsx"
        if os.path.exists(db_path):
            try:
                xls = pd.ExcelFile(db_path)
                dfs = [pd.read_excel(db_path, sheet_name=s) for s in xls.sheet_names]
                for df in dfs:
                    df.columns = ['Region', 'Township', 'Ward', 'PostalCode']
                self.postal_df = pd.concat(dfs, ignore_index=True)
            except Exception as e:
                print(f"Postal DB Warning: {e}")

    # --- TAB 1: MANIFEST PROCESSING ---
    def build_manifest_tab(self):
        lbl = tk.Label(self.tab_manifest, text="Convert Inbound Manifest to System-Ready Waybills", font=("Arial", 12, "bold"))
        lbl.pack(pady=15)
        
        self.mf_file_var = tk.StringVar(value="No file selected")
        tk.Label(self.tab_manifest, textvariable=self.mf_file_var, fg="blue").pack()
        
        tk.Button(self.tab_manifest, text="Load Raw Manifest (.xlsx)", command=self.load_manifest).pack(pady=10)
        
        self.mf_btn_process = tk.Button(self.tab_manifest, text="Run Complete Pipeline & Save", state="disabled", 
                                        command=self.process_manifest, bg="#0b2236", fg="white", font=("Arial", 10, "bold"), height=2)
        self.mf_btn_process.pack(fill="x", padx=50, pady=20)
        
        info = tk.Label(self.tab_manifest, text="Pipeline executes: Column Standards > Data Cleaning (Ghost rows) >\nLocation Mapping > Old Way ID Clearing > Payment/Tier Business Rules", justify="center", fg="gray")
        info.pack()

    def load_manifest(self):
        self.mf_path = filedialog.askopenfilename(filetypes=[("Excel Files", "*.xlsx")])
        if self.mf_path:
            self.mf_file_var.set(os.path.basename(self.mf_path))
            self.mf_btn_process.config(state="normal")

    def process_manifest(self):
        try:
            df = pd.read_excel(self.mf_path)
            initial_count = len(df)
            
            # 1. Clean Ghost Rows
            df.dropna(subset=['Receiver Address'], inplace=True)
            df = df[df['Receiver Address'].astype(str).str.strip() != '']
            
            # 2. Standardize Columns
            target_cols = ['Way ID / Pickup ID', 'Merchant Name', 'Receiver Name', 'Receiver Phone', 'City (Dropdown)', 'Township (Dropdown)', 'Ward / Village Tract (Dropdown)', 'Postal Code (Auto)', 'Receiver Address', 'Actual Weight (KG)', 'Service Type', 'Payment Type', 'Item Price', 'OS Set Price', 'Merchant Tier', 'မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\n(Township / Service Provider)']
            for col in target_cols:
                if col not in df.columns:
                    df[col] = ''
            
            # 3. Apply Rules, IDs, and Locations row by row
            def process_row(row):
                # Clear Way ID to Ref
                way_id = str(row.get('Way ID / Pickup ID', '')).strip()
                addr = str(row.get('Receiver Address', '')).strip()
                if way_id and way_id.upper() not in ['NAN', 'NONE', '']:
                    if f"[Ref: {way_id}]" not in addr:
                        addr = f"{addr} [Ref: {way_id}]"
                row['Way ID / Pickup ID'] = ""
                row['Receiver Address'] = addr
                
                # Payment & Tier Rules
                merchant = str(row.get('Merchant Name', '')).upper()
                row['Payment Type'] = 'EXACT_COLLECTION_AMOUNT' if any(x in merchant for x in ['DKS', 'GRS']) else 'ITEM_PRICE_AND_DELIVERY_CHARGES'
                row['Merchant Tier'] = 'STANDARD'
                row['Service Type'] = 'STANDARD'
                provider = 'မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\n(Township / Service Provider)'
                if pd.isna(row.get(provider)) or str(row.get(provider)).strip() == '':
                    row[provider] = 'Britium Express'
                
                # Location Mapping (Simplified logic)
                if pd.isna(row.get('City (Dropdown)')) or str(row.get('City (Dropdown)')).strip() == '':
                    for my_town, en_town in EN_TOWN_MAP.items():
                        if my_town in addr:
                            row['Township (Dropdown)'] = f"{en_town} Township / {my_town} မြို့နယ်"
                            if my_town in ['မဟာအောင်မြေ', 'ချမ်းမြသာစည်', 'အောင်မြေသာစံ', 'ချမ်းအေးသာစံ']:
                                row['City (Dropdown)'] = 'Mandalay Region / မန္တလေးတိုင်းဒေသကြီး'
                            elif my_town in ['ပျဉ်းမနား', 'ပုဗ္ဗသီရိ', 'ဇမ္ဗူသီရိ']:
                                row['City (Dropdown)'] = 'Naypyitaw Union Territory / နေပြည်တော် (ပြည်ထောင်စုနယ်မြေ)'
                            else:
                                row['City (Dropdown)'] = 'Yangon Region / ရန်ကုန်တိုင်းဒေသကြီး'
                            break
                return row

            df = df.apply(process_row, axis=1)
            
            # 4. Save
            save_path = filedialog.asksaveasfilename(defaultextension=".xlsx", initialfile="Manifest_ReadyToUpload.xlsx")
            if save_path:
                df = df.reindex(columns=target_cols)
                # Clean illegal characters
                for col in df.columns:
                    if df[col].dtype == object:
                        df[col] = df[col].apply(lambda x: re.sub(r'[\000-\010]|[\013-\014]|[\016-\037]', '', str(x)) if pd.notna(x) else x)
                with pd.ExcelWriter(save_path, engine='openpyxl') as writer:
                    df.to_excel(writer, index=False)
                messagebox.showinfo("Success", f"Processed {len(df)} valid rows (Removed {initial_count - len(df)} ghost rows).\nSaved to:\n{save_path}")
        except Exception as e:
            messagebox.showerror("Error", str(e))

    # --- TAB 2: REVIEW LOCATION PROCESSING ---
    def build_review_tab(self):
        lbl = tk.Label(self.tab_review, text="Auto-Fix Location Review Excel", font=("Arial", 12, "bold"))
        lbl.pack(pady=15)
        
        self.rev_file_var = tk.StringVar(value="No file selected")
        tk.Label(self.tab_review, textvariable=self.rev_file_var, fg="blue").pack()
        
        tk.Button(self.tab_review, text="Load Review File (.xlsx)", command=self.load_review).pack(pady=10)
        
        self.rev_btn_process = tk.Button(self.tab_review, text="Inject Coordinates & Save", state="disabled", 
                                         command=self.process_review, bg="#2e7d32", fg="white", font=("Arial", 10, "bold"), height=2)
        self.rev_btn_process.pack(fill="x", padx=50, pady=20)

    def load_review(self):
        self.rev_path = filedialog.askopenfilename(filetypes=[("Excel Files", "*.xlsx")])
        if self.rev_path:
            self.rev_file_var.set(os.path.basename(self.rev_path))
            self.rev_btn_process.config(state="normal")

    def process_review(self):
        try:
            xls = pd.ExcelFile(self.rev_path)
            df = pd.read_excel(xls, sheet_name=xls.sheet_names[0])
            inst_df = pd.read_excel(xls, sheet_name=1) if len(xls.sheet_names) > 1 else None

            def apply_coords(row):
                if pd.notna(row.get('Suggested Latitude')):
                    row['Action'] = 'SKIP_REVIEW'
                else:
                    tsp = row.get('Township')
                    if pd.notna(tsp) and tsp in COORDS:
                        row['Corrected Latitude'] = COORDS[tsp][0]
                        row['Corrected Longitude'] = COORDS[tsp][1]
                        row['Action'] = 'APPLY_CORRECTION'
                return row

            df = df.apply(apply_coords, axis=1)
            
            save_path = filedialog.asksaveasfilename(defaultextension=".xlsx", initialfile="LocationReview_Fixed.xlsx")
            if save_path:
                with pd.ExcelWriter(save_path, engine='openpyxl') as writer:
                    df.to_excel(writer, sheet_name=xls.sheet_names[0], index=False)
                    if inst_df is not None:
                        inst_df.to_excel(writer, sheet_name=xls.sheet_names[1], index=False)
                messagebox.showinfo("Success", f"Coordinates injected for {len(df)} rows.\nSaved to:\n{save_path}")
        except Exception as e:
            messagebox.showerror("Error", str(e))

if __name__ == "__main__":
    root = tk.Tk()
    app = BritiumDailyOps(root)
    root.mainloop()