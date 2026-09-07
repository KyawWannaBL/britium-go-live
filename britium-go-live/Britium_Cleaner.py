import tkinter as tk
from tkinter import filedialog, messagebox
import pandas as pd
import re

class BritiumCleanerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Britium Express - Manifest Prepper")
        self.root.geometry("450x350")
        self.root.config(padx=20, pady=20)
        
        self.df = None
        self.file_path = None

        # UI Elements
        self.label = tk.Label(root, text="Step 1: Load your raw manifest", font=("Arial", 10, "bold"))
        self.label.pack(pady=(0, 5))

        self.btn_load = tk.Button(root, text="Load Excel File", command=self.load_file, bg="#0b2236", fg="white")
        self.btn_load.pack(fill="x", pady=5)

        self.status_var = tk.StringVar()
        self.status_var.set("No file loaded.")
        self.status_label = tk.Label(root, textvariable=self.status_var, fg="gray")
        self.status_label.pack(pady=5)

        # Action Buttons
        self.btn_clean = tk.Button(root, text="1. Delete Empty Rows (Fixes 500 -> 337)", command=self.delete_empty_rows, state="disabled")
        self.btn_clean.pack(fill="x", pady=5)

        self.btn_wayid = tk.Button(root, text="2. Clear Way IDs & Move to Ref", command=self.clear_way_ids, state="disabled")
        self.btn_wayid.pack(fill="x", pady=5)

        self.btn_rules = tk.Button(root, text="3. Apply Business Rules (DKS / Standard)", command=self.apply_rules, state="disabled")
        self.btn_rules.pack(fill="x", pady=5)

        self.btn_save = tk.Button(root, text="Save Processed File", command=self.save_file, state="disabled", bg="#2e7d32", fg="white")
        self.btn_save.pack(fill="x", pady=20)

    def load_file(self):
        self.file_path = filedialog.askopenfilename(filetypes=[("Excel Files", "*.xlsx")])
        if self.file_path:
            try:
                self.df = pd.read_excel(self.file_path)
                self.status_var.set(f"Loaded {len(self.df)} rows.")
                self.btn_clean.config(state="normal")
                self.btn_wayid.config(state="normal")
                self.btn_rules.config(state="normal")
                self.btn_save.config(state="normal")
            except Exception as e:
                messagebox.showerror("Error", f"Failed to load file: {e}")

    def delete_empty_rows(self):
        if self.df is not None:
            initial_count = len(self.df)
            # Drops rows where either Receiver Name or Address is completely blank
            self.df.dropna(subset=['Receiver Name', 'Receiver Address'], how='all', inplace=True)
            # Drop rows where the address is just empty space
            self.df = self.df[self.df['Receiver Address'].astype(str).str.strip() != '']
            
            new_count = len(self.df)
            self.status_var.set(f"Deleted {initial_count - new_count} empty ghost rows. Now {new_count} rows.")
            messagebox.showinfo("Success", f"Cleared empty rows. Total ways is now {new_count}.")

    def clear_way_ids(self):
        if self.df is not None:
            def process_row(row):
                way_id = str(row.get('Way ID / Pickup ID', '')).strip()
                addr = str(row.get('Receiver Address', '')).strip()
                if way_id and way_id.upper() not in ['NAN', 'NONE', '']:
                    if f"[Ref: {way_id}]" not in addr:
                        row['Receiver Address'] = f"{addr} [Ref: {way_id}]"
                    row['Way ID / Pickup ID'] = "" 
                return row
            
            self.df = self.df.apply(process_row, axis=1)
            self.status_var.set("Way IDs cleared and moved to address refs.")
            messagebox.showinfo("Success", "Way IDs have been cleared for new pickup generation.")

    def apply_rules(self):
        if self.df is not None:
            for idx, row in self.df.iterrows():
                merchant = str(row.get('Merchant Name', '')).upper()
                if 'DKS' in merchant or 'GRS' in merchant:
                    self.df.at[idx, 'Payment Type'] = 'EXACT_COLLECTION_AMOUNT'
                else:
                    self.df.at[idx, 'Payment Type'] = 'ITEM_PRICE_AND_DELIVERY_CHARGES'
                
                self.df.at[idx, 'Merchant Tier'] = 'STANDARD'
                self.df.at[idx, 'Service Type'] = 'STANDARD'
                
                provider = 'မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\n(Township / Service Provider)'
                if provider in self.df.columns and (pd.isna(row.get(provider)) or str(row.get(provider)).strip() == ''):
                    self.df.at[idx, provider] = 'Britium Express'

            self.status_var.set("Business rules applied.")
            messagebox.showinfo("Success", "Payment types and tiers have been updated.")

    def save_file(self):
        if self.df is not None:
            save_path = filedialog.asksaveasfilename(defaultextension=".xlsx", filetypes=[("Excel Files", "*.xlsx")], initialfile="READY_TO_UPLOAD.xlsx")
            if save_path:
                try:
                    # Clean illegal characters before saving to prevent Excel corruption
                    for col in self.df.columns:
                        if self.df[col].dtype == object:
                            self.df[col] = self.df[col].apply(lambda x: re.sub(r'[\000-\010]|[\013-\014]|[\016-\037]', '', x) if isinstance(x, str) else x)

                    with pd.ExcelWriter(save_path, engine='openpyxl') as writer:
                        self.df.to_excel(writer, index=False)
                    messagebox.showinfo("Success", f"File successfully saved to:\n{save_path}")
                except Exception as e:
                    messagebox.showerror("Error", f"Failed to save file: {e}")

if __name__ == "__main__":
    root = tk.Tk()
    app = BritiumCleanerApp(root)
    root.mainloop()