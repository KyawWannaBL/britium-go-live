const fs=require('node:fs/promises');
const path=require('node:path');
const sharp=require('sharp');
async function prepareEnterpriseIcon(outputDir='assets'){
 await fs.mkdir(outputDir,{recursive:true});
 const target=path.join(outputDir,'logo.png');const temporary=target+'.tmp.png';
 const supplied=path.join(__dirname,'../android-assets/enterprise-app-icon-user.b64');
 const brand=path.join(__dirname,'../../public/favicon.svg');
 let source='SUPPLIED_ENTERPRISE_ICON';
 try{
  const bytes=Buffer.from(await fs.readFile(supplied,'utf8'),'base64');
  await sharp(bytes).resize(1024,1024,{fit:'cover'}).png({palette:false,compressionLevel:9}).toFile(temporary);
 }catch(error){
  source='EXISTING_BRAND_FAVICON';
  console.warn('Supplied Enterprise icon cannot be decoded; using the checked-in blue Britium favicon:',error.message);
  // Keep strict decoding. A corrupt image must not become a partly gray launcher.
  await sharp(brand,{density:3072}).resize(1024,1024,{fit:'cover'}).png({palette:false,compressionLevel:9}).toFile(temporary);
 }
 await fs.rename(temporary,target);
 return {source,path:target};
}
if(require.main===module){const index=process.argv.indexOf('--output-dir');prepareEnterpriseIcon(index>=0?process.argv[index+1]:'assets').then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error);process.exitCode=1;});}
module.exports={prepareEnterpriseIcon};
