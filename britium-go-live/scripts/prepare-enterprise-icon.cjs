const fs=require('node:fs/promises');
const path=require('node:path');
const https=require('node:https');
const crypto=require('node:crypto');
const sharp=require('sharp');

// Final user-approved gold-bordered Enterprise mascot. Do not use the legacy icon.
const ICON_URL='https://cdn.creativeclaw.co/u/1e27c35b/images/60a5da45-3d66-42ed-908f-86e112161bdd.png';
const ICON_SHA256='bf24b4b139d686ea231a74fa49bbc9d8ec52ac4f53c5db16b74c7b42764df9d3';
function download(url){
  return new Promise((resolve,reject)=>{
    https.get(url,{timeout:20000},response=>{
      if(response.statusCode!==200){response.resume();reject(new Error('Approved icon download failed: HTTP '+response.statusCode));return;}
      const chunks=[];let size=0;
      response.on('data',chunk=>{size+=chunk.length;if(size>10000000){response.destroy(new Error('Icon too large'));return;}chunks.push(chunk);});
      response.on('end',()=>resolve(Buffer.concat(chunks)));
      response.on('error',reject);
    }).on('error',reject);
  });
}
async function prepareEnterpriseIcon(outputDir='assets'){
  await fs.mkdir(outputDir,{recursive:true});
  const target=path.join(outputDir,'logo.png'),temporary=target+'.tmp.png';
  try {
    const bytes=await download(ICON_URL);
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==ICON_SHA256)
      throw new Error('Final approved icon SHA256 mismatch: refusing older or substituted artwork');
    const info=await sharp(bytes,{failOn:'error'}).metadata();
    if(!info.width||!info.height||info.width<192||info.height<192)
      throw new Error('Icon must be at least 192x192');
    await sharp(bytes,{failOn:'error'}).resize(1024,1024,{fit:'contain',background:'#0759D6'}).png({palette:false,compressionLevel:9}).toFile(temporary);
    await fs.rename(temporary,target);
    return {source:'FINAL_GOLD_BORDERED_ENTERPRISE_MASCOT',path:target,width:info.width,height:info.height,sha256:ICON_SHA256};
  }catch(error){
    await fs.rm(temporary,{force:true}).catch(()=>{});
    throw new Error('Enterprise launcher icon preparation failed; refusing older icon: '+error.message);
  }
}
if(require.main===module){
 const index=process.argv.indexOf('--output-dir');
 prepareEnterpriseIcon(index>=0?process.argv[index+1]:'assets').then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={prepareEnterpriseIcon};
