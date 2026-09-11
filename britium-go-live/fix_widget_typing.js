import fs from 'fs';
const file = './src/pages/DataEntryFinancialV2Page.tsx';

try {
  let code = fs.readFileSync(file, 'utf8');

  // 1. Unlock the textbox by making it an uncontrolled native DOM element
  code = code.replace(
    'value={customPickupId}', 
    'defaultValue={customPickupId} id="customPickupIdInput"'
  );

  // 2. Update the validation check to read directly from the live textbox
  code = code.replace(
    'if (!customPickupId.trim())', 
    'const rawId = document.getElementById("customPickupIdInput") ? (document.getElementById("customPickupIdInput") as HTMLInputElement).value : customPickupId;\n    if (!rawId.trim())'
  );

  // 3. Ensure the converter grabs exactly what you typed
  code = code.replace(
    'const pickupId = customPickupId.trim();', 
    'const pickupId = rawId.trim();'
  );

  fs.writeFileSync(file, code);
  console.log("✅ Widget Textbox Unlocked! You can now type freely.");
} catch(e) {
  console.error("Error:", e);
}
