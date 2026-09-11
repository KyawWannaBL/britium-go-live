// Calculation is read-only. Retry only a confirmed server statement timeout, once.
export async function calculateWithTimeoutRetry<T extends {error?:any}>(run:()=>PromiseLike<T>):Promise<T> {
  for(let attempt=0;attempt<2;attempt++){
    let timer:ReturnType<typeof setTimeout>|undefined;
    const response=await Promise.race([
      Promise.resolve(run()),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("Calculation timed out after 30 seconds. Retry this parcel.")),30000);}),
    ]).finally(()=>{if(timer!==undefined)clearTimeout(timer);});
    if(attempt===0 && (response.error?.code==="57014" || /statement timeout/i.test(response.error?.message||""))){
      await new Promise(resolve=>setTimeout(resolve,500));
      continue;
    }
    return response;
  }
  throw new Error("Calculation retry exhausted.");
}
