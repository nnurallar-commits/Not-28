(function(){
  const LS='not28-data-v1';
  const LEGACY_KEYS=['not28-v4','not28-data-v1'];
  const BACKUP='not28-precloud-backup-v9';
  const DOC='shared/main';
  let db=null, auth=null, saveTimer=null, connected=false, syncing=false, lastError='', lastSync='';
  const clone=x=>JSON.parse(JSON.stringify(x));
  function parseKey(k){try{return JSON.parse(localStorage.getItem(k))}catch{return null}}
  function local(){return parseKey(LS)||{profiles:[]}}
  function backup(){if(!localStorage.getItem(BACKUP)) localStorage.setItem(BACKUP,JSON.stringify(local()))}
  function keyify(arr){const m=new Map();(arr||[]).forEach(x=>m.set(x.id||JSON.stringify(x),clone(x)));return m}
  function mergeRecordArrays(a,b){
    const m=keyify(a);
    for(const x of b||[]){const k=x.id||JSON.stringify(x);const old=m.get(k);m.set(k,old?{...old,...clone(x)}:clone(x))}
    return [...m.values()];
  }
  function mergeData(a,b){
    const out={profiles:[]}, mp=new Map();
    for(const pr of [...(a?.profiles||[]),...(b?.profiles||[])]){
      if(!pr?.id) continue;
      const old=mp.get(pr.id);
      if(!old) mp.set(pr.id,clone(pr));
      else mp.set(pr.id,{...old,...clone(pr),periods:mergeRecordArrays(old.periods,pr.periods),symptoms:mergeRecordArrays(old.symptoms,pr.symptoms),ovulation:mergeRecordArrays(old.ovulation,pr.ovulation),notes:mergeRecordArrays(old.notes,pr.notes),meds:mergeRecordArrays(old.meds,pr.meds)});
    }
    out.profiles=[...mp.values()];
    return out;
  }
  function migrateLegacy(){
    let merged=local();
    for(const k of LEGACY_KEYS){const d=parseKey(k);if(d?.profiles) merged=mergeData(merged,d)}
    localStorage.setItem(LS,JSON.stringify(merged));
    return merged;
  }
  function emitData(d){window.dispatchEvent(new CustomEvent('not28-cloud-data',{detail:d}))}
  function emitStatus(){window.dispatchEvent(new CustomEvent('not28-cloud-status',{detail:{connected,syncing,lastError,lastSync,text:statusText()}}))}
  function setStatus(p){Object.assign({},{},p); if('connected' in p)connected=p.connected;if('syncing' in p)syncing=p.syncing;if('lastError' in p)lastError=p.lastError;if('lastSync' in p)lastSync=p.lastSync;emitStatus()}
  function markSync(){lastSync=new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});lastError='';syncing=false;emitStatus()}
  async function write(d){
    if(!connected||!db) return false;
    syncing=true; emitStatus();
    const ref=db.doc(DOC);
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      const remote=snap.exists?snap.data():{profiles:[]};
      const merged=mergeData(remote,d);
      tx.set(ref,{...clone(merged),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:false});
    });
    markSync();
    return true;
  }
  async function start(){
    const cfg=window.NOT28_FIREBASE_CONFIG;
    if(!cfg||!cfg.apiKey||!window.firebase){lastError='firebase ayarı eksik';emitStatus();return}
    try{
      backup();
      const localData=migrateLegacy();
      if(!firebase.apps.length) firebase.initializeApp(cfg);
      auth=firebase.auth(); db=firebase.firestore();
      await auth.signInAnonymously();
      connected=true; lastError=''; emitStatus();
      const ref=db.doc(DOC);
      const snap=await ref.get();
      const merged=mergeData(snap.exists?snap.data():{profiles:[]},localData);
      localStorage.setItem(LS,JSON.stringify(merged));
      emitData(merged);
      await write(merged);
      ref.onSnapshot(s=>{
        if(!s.exists)return;
        const remote=s.data();
        const mergedNow=mergeData(local(),remote);
        localStorage.setItem(LS,JSON.stringify(mergedNow));
        emitData(mergedNow);
        markSync();
      },e=>{lastError=e.message||'senkronizasyon hatası';connected=false;syncing=false;emitStatus()});
    }catch(e){lastError=e.message||String(e);connected=false;syncing=false;console.error('Not28 cloud:',e);emitStatus()}
  }
  function queueSave(d){
    if(!connected){start();return}
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>write(d).catch(e=>{lastError=e.message||String(e);syncing=false;emitStatus()}),250);
  }
  async function syncNow(){
    try{
      if(!connected){await start();if(!connected)return false}
      syncing=true;emitStatus();
      const ref=db.doc(DOC),snap=await ref.get();
      const merged=mergeData(snap.exists?snap.data():{profiles:[]},local());
      localStorage.setItem(LS,JSON.stringify(merged));
      emitData(merged);
      await write(merged);
      return true;
    }catch(e){lastError=e.message||String(e);syncing=false;emitStatus();return false}
  }
  function statusText(){
    if(lastError)return 'bağlantı hatası · '+lastError;
    if(syncing)return 'eşitleniyor…';
    if(connected)return 'bağlı · ortak veri açık'+(lastSync?' · '+lastSync:'');
    return 'bağlanıyor…';
  }
  window.Not28Cloud={start,queueSave,syncNow,statusText,isConnected:()=>connected};
  window.addEventListener('load',start);
})();
