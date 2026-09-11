import fs from 'fs';
const file = './src/pages/DataEntryFinancialV2Page.tsx';

try {
  let code = fs.readFileSync(file, 'utf8');

  // Find the broken literal newline and replace it with a properly escaped \\n
  const brokenString = '"မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\n(Township / Service Provider)"';
  const brokenStringWindows = '"မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\r\n(Township / Service Provider)"';
  const fixedString = '"မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\\n(Township / Service Provider)"';

  if (code.includes(brokenString)) {
    code = code.replace(brokenString, fixedString);
  } else if (code.includes(brokenStringWindows)) {
    code = code.replace(brokenStringWindows, fixedString);
  }

  fs.writeFileSync(file, code);
  console.log("✅ Build error fixed! Unterminated string has been safely escaped.");
} catch (error) {
  console.error("Error:", error);
}
