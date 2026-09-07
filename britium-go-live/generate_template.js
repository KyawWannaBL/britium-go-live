import ExcelJS from 'exceljs';

async function createTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Data Entry');
  const listSheet = workbook.addWorksheet('Validation_Lists');
  
  // Hide the validation sheet from staff
  listSheet.state = 'hidden';

  const cities = ["ရန်ကုန်", "မန္တလေး", "နေပြည်တော်", "ပဲခူး"];
  const townships = [
    "ရွှေပြည်သာ", "ကြည့်မြင်တိုင်", "လမ်းမတော်", "လှိုင်", "ပန်းဘဲတန်း", 
    "မြောက်ဥက္ကလာပ", "သာကေတ", "မင်္ဂလာတောင်ညွန့်", "သင်္ဃန်းကျွန်း", "မင်္ဂလာဒုံ",
    "မရမ်းကုန်း", "အင်းစိန်", "မြောက်ဒဂုံ", "ဗဟန်း", "လှိုင်သာယာ", "တောင်ဥက္ကလာပ",
    "ဒဂုံမြို့သစ်", "စမ်းချောင်း", "တာမွေ", "ရန်ကင်း", "ကျောက်တံတား", "လသာ", "ဒေါပုံ"
  ];

  listSheet.getColumn(1).values = cities;
  listSheet.getColumn(2).values = townships;

  sheet.columns = [
    { header: 'Way ID / Pickup ID', key: 'id', width: 25 },
    { header: 'Merchant Name', key: 'merchant', width: 25 },
    { header: 'Receiver Name', key: 'receiver', width: 20 },
    { header: 'Receiver Phone', key: 'phone', width: 20 },
    { header: 'City (Dropdown)', key: 'city', width: 20 },
    { header: 'Township (Dropdown)', key: 'township', width: 25 },
    { header: 'Receiver Address', key: 'address', width: 40 },
    { header: 'Actual Weight (KG)', key: 'weight', width: 15 },
    { header: 'Service Type', key: 'service', width: 20 },
    { header: 'Payment Type', key: 'payment', width: 25 },
    { header: 'Item Price', key: 'price', width: 15 },
    { header: 'OS Set Price', key: 'os_price', width: 15 }
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // Lock 1000 rows with dropdown data validation
  for (let i = 2; i <= 1000; i++) {
    sheet.getCell(`E${i}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['Validation_Lists!$A$1:$A$4'] };
    sheet.getCell(`F${i}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`Validation_Lists!$B$1:$B$${townships.length}`] };
  }

  await workbook.xlsx.writeFile('Britium_Bulk_Upload_Template_Locked.xlsx');
  console.log('✅ Excel Template generated successfully!');
}

createTemplate();
