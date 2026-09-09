(function(){
  const LS='not28-v4';
  const BACKUP='not28-precloud-backup-v7';
  const DOC='shared/main';
  let db=null, auth=null, saveTimer=null, connected=false, lastError='';
  const clone=x=>JSON.parse(JSON.stringify(x));
  function local(){try{return JSON.parse(localStorage.getItem(LS))||{profiles:[]}}catch{return {profiles:[]}}}
  function backup(){if(!localStorage.getItem(BACKUP))localStorage.setItem(BACKUP,JSON.stringify(local()))}
  function keyify(arr){const m=new Map();(arr||[]).forEach(x=>m.set(x.id||JSON.stringify(x),clone(x)));return m}
  function mergeRecordArrays(a,b){const m=keyify(a);for(const x of b||[]){const k=x.id||JSON.stringify(x);const old=m.get(k);if(!old)m.set(k,clone(x));else m.set(k,{...old,...clone(x)})}return [...m.values()]}
  function mergeData(a,b){
    const out={profiles:[]}, mp=new Map();
    for(const pr of [...(a?.profiles||[]),...(b?.profiles||[])]){
      if(!pr?.id)continue; const old=mp.get(pr.id);
      if(!old)mp.set(pr.id,clone(pr)); else mp.set(pr.id,{...old,...clone(pr),periods:mergeRecordArrays(old.periods,pr.periods),symptoms:mergeRecordArrays(old.symptoms,pr.symptoms),ovulation:mergeRecordArrays(old.ovulation,pr.ovulation),notes:mergeRecordArrays(old.notes,pr.notes),meds:mergeRecordArrays(old.meds,pr.meds)});
    }
    out.profiles=[...mp.values()]; return out;
  }
  function emit(d){window.dispatchEvent(new CustomEvent('not28-cloud-data',{detail:d}))}
  async function write(d){if(!connected||!db)return; await db.doc(DOC).set({...clone(d),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:false})}
  async function start(){
    const cfg=window.NOT28_FIREBASE_CONFIG;
    if(!cfg||!cfg.apiKey||!window.firebase){lastError='firebase ayarı eksik';return}
    try{
      backup();
      if(!firebase.apps.length)firebase.initializeApp(cfg);
      auth=firebase.auth(); db=firebase.firestore();
      await auth.signInAnonymously(); connected=true;
      const ref=db.doc(DOC);
      const snap=await ref.get();
      const merged=mergeData(snap.exists?snap.data():{profiles:[]},local());
      await write(merged); emit(merged);
      ref.onSnapshot(s=>{if(!s.exists)return;const mergedNow=mergeData(s.data(),local());localStorage.setItem(LS,JSON.stringify(mergedNow));emit(mergedNow)},e=>{lastError=e.message||'senkronizasyon hatası'});
    }catch(e){lastError=e.message||String(e);console.error(e)}
  }
  function queueSave(d){if(!connected)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>write(d).catch(e=>{lastError=e.message||String(e)}),500)}
  async function syncNow(){if(!connected){await start();if(!connected)return false}const snap=await db.doc(DOC).get();const merged=mergeData(snap.exists?snap.data():{profiles:[]},local());await write(merged);localStorage.setItem(LS,JSON.stringify(merged));emit(merged);return true}
  function statusText(){return connected?'bağlı · ortak veriler açık':(lastError||'firebase ayarı bekleniyor')}
  window.Not28Cloud={start,queueSave,syncNow,statusText};
  window.addEventListener('load',()=>start());
})();
