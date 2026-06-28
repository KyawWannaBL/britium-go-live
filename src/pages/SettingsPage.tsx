// src/pages/SettingsPage.tsx
import { useState, useEffect } from 'react';
import { fetchTariff, updateTariff, fetchUsers, toggleUserStatus, fetchSystemConfig, setSystemConfig, TariffTier, UserRecord, SysConfig } from '@/lib/settingsApi';

const G='#D4AF37'; const N='#0A1628';
type Tab='tariff'|'users'|'config';
const inp:React.CSSProperties={background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,padding:'7px 10px',color:'#fff',fontSize:12,outline:'none',width:'100%',boxSizing:'border-box'};
const STATUS_COLOR:Record<string,string>={active:'#22c55e',inactive:'#94a3b8',suspended:'#f87171'};
const ROLES=['admin','operation_manager','supervisor','cs','data_entry','dispatch','warehouse','finance','accountant','cashier','auditor','rider','driver','helper','merchant','customer','branch_office'];

export default function SettingsPage(){
  const [tab,setTab]=useState<Tab>('tariff');
  const [tiers,setTiers]=useState<TariffTier[]>([]);
  const [users,setUsers]=useState<UserRecord[]>([]);
  const [configs,setConfigs]=useState<SysConfig[]>([]);
  const [editing,setEditing]=useState<Record<string,Record<string,number>>>({});
  const [configEdits,setConfigEdits]=useState<Record<string,string>>({});
  const [filterRole,setFilterRole]=useState('');
  const [msg,setMsg]=useState('');
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    if(tab==='tariff') fetchTariff().then(t=>{ setTiers(t); const e:Record<string,Record<string,number>>={};t.forEach(x=>{ e[x.tier_name]={base_fee:x.base_fee_mmk,extra_per_kg:x.extra_per_kg_mmk,free_kg:x.free_allowance_kg,highway_fee:x.highway_fee_mmk}; }); setEditing(e); }).catch(()=>{});
    if(tab==='users') fetchUsers(filterRole||undefined).then(setUsers).catch(()=>{});
    if(tab==='config') fetchSystemConfig().then(c=>{ setConfigs(c); const e:Record<string,string>={};c.forEach(x=>{ e[x.config_key]=x.config_value; }); setConfigEdits(e); }).catch(()=>{});
  },[tab,filterRole]);

  const saveTariff=async(tier:string)=>{
    const e=editing[tier]; if(!e) return;
    setSaving(true); setMsg('');
    try{ await updateTariff(tier,e.base_fee,e.extra_per_kg,e.free_kg,e.highway_fee); setMsg('✅ '+tier+' tariff updated'); await fetchTariff().then(setTiers); }
    catch(err:unknown){ setMsg(err instanceof Error?err.message:'Save failed'); }
    finally{ setSaving(false); }
  };

  const saveConfig=async(key:string)=>{
    setSaving(true);
    try{ await setSystemConfig(key,configEdits[key]); setMsg('✅ Config saved: '+key); }
    catch(err:unknown){ setMsg(err instanceof Error?err.message:'Save failed'); }
    finally{ setSaving(false); }
  };

  const toggleUser=async(userId:string, current:string)=>{
    const next=current==='active'?'inactive':'active';
    try{ await toggleUserStatus(userId,next as 'active'|'inactive'); fetchUsers(filterRole||undefined).then(setUsers); }
    catch(err:unknown){ setMsg(err instanceof Error?err.message:'Toggle failed'); }
  };

  const TABS:Tab[]=['tariff','users','config'];
  const tabLabels:Record<Tab,string>={tariff:'🏷 Tariff Master',users:'👥 User Management',config:'⚙️ System Config'};

  return (
    <div style={{maxWidth:960,margin:'0 auto',padding:'24px 20px 60px'}}>
      <div style={{marginBottom:24}}>
        <h1 style={{fontSize:20,fontWeight:800,color:'#fff',margin:'0 0 3px'}}>Settings</h1>
        <div style={{fontSize:12,color:'rgba(255,255,255,0.4)'}}>System administration — Tariff, Users, and Configuration</div>
      </div>

      <div style={{display:'flex',gap:4,marginBottom:24}}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>{setTab(t);setMsg('');}} style={{background:tab===t?'rgba(212,175,55,0.12)':'transparent',border:'1px solid '+(tab===t?'rgba(212,175,55,0.3)':'rgba(255,255,255,0.08)'),borderRadius:8,padding:'7px 16px',color:tab===t?G:'rgba(255,255,255,0.5)',fontSize:12,fontWeight:600,cursor:'pointer'}}>{tabLabels[t]}</button>
        ))}
      </div>

      {msg&&<div style={{padding:'10px 14px',background:msg.startsWith('✅')?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)',border:'1px solid '+(msg.startsWith('✅')?'rgba(34,197,94,0.3)':'rgba(239,68,68,0.3)'),borderRadius:8,fontSize:12,color:msg.startsWith('✅')?'#22c55e':'#f87171',marginBottom:16}}>{msg}</div>}

      {/* TARIFF MASTER */}
      {tab==='tariff'&&(
        <div>
          <div style={{background:'rgba(212,175,55,0.04)',border:'1px solid rgba(212,175,55,0.15)',borderRadius:8,padding:'10px 14px',fontSize:11,color:'rgba(255,255,255,0.5)',marginBottom:20}}>
            Changes are audit-logged and applied immediately to all new shipments. Existing shipments are not retroactively affected.
          </div>
          {(tiers??[]).map(tier=>{
            const e=editing[tier.tier_name]||{base_fee:tier.base_fee_mmk,extra_per_kg:tier.extra_per_kg_mmk,free_kg:tier.free_allowance_kg,highway_fee:tier.highway_fee_mmk};
            const setE=(k:string,v:number)=>setEditing(p=>({...p,[tier.tier_name]:{...p[tier.tier_name],[k]:v}}));
            return (
              <div key={tier.tier_name} style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:12,padding:'18px 20px',marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                  <div style={{fontSize:14,fontWeight:700,color:'#fff'}}>{tier.tier_name} Tier</div>
                  <button onClick={()=>saveTariff(tier.tier_name)} disabled={saving} style={{background:saving?'rgba(255,255,255,0.08)':G,color:saving?'rgba(255,255,255,0.3)':N,border:'none',borderRadius:8,padding:'7px 18px',fontSize:11,fontWeight:700,cursor:saving?'default':'pointer'}}>Save</button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}}>
                  {[['Free Allowance (kg)','free_kg',e.free_kg],['Base Fee (MMK)','base_fee',e.base_fee],['Extra per kg (MMK)','extra_per_kg',e.extra_per_kg],['Highway Fee (MMK)','highway_fee',e.highway_fee]].map(([lbl,key,val])=>(
                    <div key={String(key)}>
                      <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',marginBottom:5}}>{lbl}</div>
                      <input style={inp} type="number" value={Number(val)} onChange={ev=>setE(String(key),parseFloat(ev.target.value)||0)}/>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:10,fontSize:11,color:'rgba(255,255,255,0.3)'}}>Total (0 extra kg): {e.base_fee.toLocaleString()} MMK · With highway: {(e.base_fee+e.highway_fee).toLocaleString()} MMK · Last updated: {new Date(tier.updated_at).toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* USER MANAGEMENT */}
      {tab==='users'&&(
        <div>
          <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'center'}}>
            <select style={{...inp,width:180}} value={filterRole} onChange={e=>{setFilterRole(e.target.value);}}>
              <option value="">All Roles</option>
              {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
            <span style={{fontSize:11,color:'rgba(255,255,255,0.4)'}}>{users.length} users</span>
          </div>
          <div style={{overflowX:'auto',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead>
                <tr style={{borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
                  {['Name','Role','Email','Phone','Branch','Status','Action'].map(h=><th key={h} style={{padding:'9px 12px',color:'rgba(255,255,255,0.4)',textAlign:'left',whiteSpace:'nowrap'}}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {(users??[]).map(u=>(
                  <tr key={u.user_id} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                    <td style={{padding:'8px 12px',color:'rgba(255,255,255,0.85)',fontWeight:500}}>{u.full_name}</td>
                    <td style={{padding:'8px 12px'}}><span style={{fontSize:9,padding:'2px 7px',borderRadius:20,background:'rgba(255,255,255,0.07)',color:'rgba(255,255,255,0.55)',fontWeight:700,textTransform:'uppercase'}}>{u.role}</span></td>
                    <td style={{padding:'8px 12px',color:'rgba(255,255,255,0.5)',fontSize:10}}>{u.email||'—'}</td>
                    <td style={{padding:'8px 12px',color:'rgba(255,255,255,0.5)',fontSize:10}}>{u.phone_number||'—'}</td>
                    <td style={{padding:'8px 12px',color:'rgba(255,255,255,0.5)'}}>{u.branch_code||'—'}</td>
                    <td style={{padding:'8px 12px'}}><span style={{fontSize:9,padding:'2px 7px',borderRadius:20,background:(STATUS_COLOR[u.status]||'#94a3b8')+'22',color:STATUS_COLOR[u.status]||'#94a3b8',fontWeight:700}}>{u.status}</span></td>
                    <td style={{padding:'8px 12px'}}>
                      <button onClick={()=>toggleUser(u.user_id,u.status)} style={{background:u.status==='active'?'rgba(239,68,68,0.12)':'rgba(34,197,94,0.12)',border:'1px solid '+(u.status==='active'?'rgba(239,68,68,0.3)':'rgba(34,197,94,0.3)'),borderRadius:6,padding:'3px 10px',color:u.status==='active'?'#f87171':'#22c55e',fontSize:10,cursor:'pointer',fontWeight:600}}>
                        {u.status==='active'?'Deactivate':'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length===0&&<tr><td colSpan={7} style={{padding:20,textAlign:'center',color:'rgba(255,255,255,0.25)'}}>No users found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SYSTEM CONFIG */}
      {tab==='config'&&(
        <div>
          <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
                  {['Config Key','Description','Value','Action'].map(h=><th key={h} style={{padding:'10px 16px',color:'rgba(255,255,255,0.4)',textAlign:'left'}}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {(configs??[]).map(c=>(
                  <tr key={c.config_key} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                    <td style={{padding:'10px 16px',color:G,fontFamily:'monospace',fontSize:11,whiteSpace:'nowrap'}}>{c.config_key}</td>
                    <td style={{padding:'10px 16px',color:'rgba(255,255,255,0.5)',fontSize:11,maxWidth:220}}>{c.description||'—'}</td>
                    <td style={{padding:'10px 16px',width:220}}>
                      <input style={inp} value={configEdits[c.config_key]??c.config_value} onChange={e=>setConfigEdits(p=>({...p,[c.config_key]:e.target.value}))}/>
                    </td>
                    <td style={{padding:'10px 16px'}}>
                      <button onClick={()=>saveConfig(c.config_key)} disabled={saving} style={{background:'rgba(212,175,55,0.12)',border:'1px solid rgba(212,175,55,0.3)',borderRadius:6,padding:'5px 12px',color:G,fontSize:11,cursor:'pointer',fontWeight:600}}>Save</button>
                    </td>
                  </tr>
                ))}
                {configs.length===0&&<tr><td colSpan={4} style={{padding:20,textAlign:'center',color:'rgba(255,255,255,0.25)'}}>No system config entries. (Table may not exist yet.)</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
