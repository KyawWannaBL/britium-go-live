const fs=require('node:fs/promises');
const path=require('node:path');
const sharp=require('sharp');

// Enterprise release must never silently replace the approved icon with a favicon.
async function prepareEnterpriseIcon(outputDir='assets'){
  await fs.mkdir(outputDir,{recursive:true});
  const target=path.join(outputDir,'logo.png');
  const temporary=target+'.tmp.png';
  const supplied=path.join(__dirname,'../android-assets/enterprise-app-icon-user.b64');
  const newPng=path.join(__dirname,'../android-assets/enterprise-app-icon-user.png');
  try {
    let bytes;
    let source='SUPPLIED_ENTERPRISE_ICON';
    try {
      bytes=await fs.readFile(newPng);
      source='SUPPLIED_ENTERPRISE_PNG';
    } catch(error) {
      if(error.code!=='ENOENT') throw error;
      const encoded=(await fs.readFile(supplied,'utf8')).replace(/\\s+/g,'');
      if(!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Invalid base64 format');
      bytes=Buffer.from(encoded,'base64');
    }
    if(bytes.length<1024) throw new Error('Enterprise logo asset is unexpectedly small');
    const info=await sharp(bytes,{failOn:'error'}).metadata();
    if(!info.width || !info.height || info.width<192 || info.height<192) {
      throw new Error('Enterprise logo requires an image of at least 192 x 192 pixels');
    }
    await sharp(bytes,{failOn:'error'}).resize(1024,1024,{fit:'contain',background:'#0759D6'})
      .png({palette:false,compressionLevel:9}).toFile(temporary);
    await fs.rename(temporary,target);
    return {source,path:target,width:info.width,height:info.height};
  } catch(error) {
    await fs.rm(temporary,{force:true}).catch(()=>{});
    throw new Error('Enterprise launcher icon preparation failed; refusing to publish an APK with the old fallback favicon: '+error.message);
  }
}
if(require.main===module){
  const index=process.argv.indexOf('--output-dir');
  prepareEnterpriseIcon(index>=0?process.argv[index+1]:'assets')
    .then(result=>console.log(JSON.stringify(result)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={prepareEnterpriseIcon};
