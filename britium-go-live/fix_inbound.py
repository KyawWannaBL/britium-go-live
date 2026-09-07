import pandas as pd
import numpy as np

file_path = "06092026_inboundlist_A(2).xlsx"
df = pd.read_excel(file_path, sheet_name='Data Entry')

def apply_corrections(row):
    addr = str(row['Receiver Address'])
    city = row['City (Dropdown)']
    
    # 1. Correct Naypyitaw addresses miscategorized as Bago/Pyay
    if pd.notna(city) and 'Bago' in city:
        if 'လယ်ဝေး' in addr:
            return pd.Series(["Naypyitaw Union Territory / နေပြည်တော် (ပြည်ထောင်စုနယ်မြေ)", "Lewe Township / လယ်ဝေး မြို့နယ်"])
        elif 'ပုဗ္ဗသီရိ' in addr:
            return pd.Series(["Naypyitaw Union Territory / နေပြည်တော် (ပြည်ထောင်စုနယ်မြေ)", "Pobbathiri Township / ပုဗ္ဗသီရိ မြို့နယ်"])
        elif 'ဇေယျာသီရိ' in addr:
            return pd.Series(["Naypyitaw Union Territory / နေပြည်တော် (ပြည်ထောင်စုနယ်မြေ)", "Zeyarthiri Township / ဇေယျာသီရိ မြို့နယ်"])
        elif 'ပျဉ်းမနား' in addr:
            return pd.Series(["Naypyitaw Union Territory / နေပြည်တော် (ပြည်ထောင်စုနယ်မြေ)", "Pyinmana Township / ပျဉ်းမနား မြို့နယ်"])
        elif 'ဇမ္ဗူသီရိ' in addr:
            return pd.Series(["Naypyitaw Union Territory / နေပြည်တော် (ပြည်ထောင်စုနယ်မြေ)", "Zabuthiri Township / ဇမ္ဗူသီရိ မြို့နယ်"])
        elif 'နေပြည်တော်' in addr:
            return pd.Series(["Naypyitaw Union Territory / နေပြည်တော် (ပြည်ထောင်စုနယ်မြေ)", "Naypyitaw (Needs Township)"])

    # 2. Fill missing Mandalay and Yangon Townships
    way_id = row['Way ID / Pickup ID']
    if way_id == 'D0904-MBO-279': return pd.Series(["Mandalay Region / မန္တလေးတိုင်းဒေသကြီး", "Mahaaungmyay Township / မဟာအောင်မြေ မြို့နယ်"])
    if way_id == 'D0904-BBW-034': return pd.Series(["Yangon Region / ရန်ကုန်တိုင်းဒေသကြီး", "Sanchaung Township / စမ်းချောင်း မြို့နယ်"])
    if way_id == 'D0824-MSE-348': return pd.Series(["Mandalay Region / မန္တလေးတိုင်းဒေသကြီး", "Chanmyathazi Township / ချမ်းမြသာစည် မြို့နယ်"])
    if way_id == 'D0806-MMM-041': return pd.Series(["Mandalay Region / မန္တလေးတိုင်းဒေသကြီး", "Amarapura Township / အမရပူရ မြို့နယ်"])
    if way_id == 'D0809-MML-079': return pd.Series(["Mandalay Region / မန္တလေးတိုင်းဒေသကြီး", "Aungmyaythazan Township / အောင်မြေသာစံ မြို့နယ်"])
    if way_id == 'D0803-MML-162': return pd.Series(["Mandalay Region / မန္တလေးတိုင်းဒေသကြီး", "Mahaaungmyay Township / မဟာအောင်မြေ မြို့နယ်"])
    if way_id == 'D0813-MML-268': return pd.Series(["Mandalay Region / မန္တလေးတိုင်းဒေသကြီး", "Mahaaungmyay Township / မဟာအောင်မြေ မြို့နယ်"])
    
    return pd.Series([row['City (Dropdown)'], row['Township (Dropdown)']])

df[['City (Dropdown)', 'Township (Dropdown)']] = df.apply(apply_corrections, axis=1)

output_path = "06092026_inboundlist_A(2)_Corrected.xlsx"
df.to_excel(output_path, index=False)
print("Corrections applied and saved to:", output_path)