/*
  KOBOM inline editor.
  With no Supabase configuration: a local-only editing demo, NOT authentication.
  With Supabase configuration: email/password authentication, server-side RLS,
  and a single public content record (slug='home').
*/
(() => {
  'use strict';
  const EDIT_KEY = 'kobom-home-demo-content-v1';
  const DEMO_SESSION = 'kobom-admin-demo-active';
  const config = window.KOBOM_SUPABASE || {};
  const connected = Boolean(config.url && (config.publishableKey || config.anonKey));
  const isHome = Boolean(document.querySelector('[data-admin-region="home"]'));
  const sections = isHome ? {
    home: document.querySelector('[data-admin-region="home"]'),
    aktuell: document.querySelector('[data-admin-region="aktuell"]')
  } : {};
  const defaults = isHome ? { homeHtml: sections.home.innerHTML, aktuellHtml: sections.aktuell.innerHTML } : null;
  let db = null;
  let admin = false;
  let editing = null;
  let beforeEdit = null;
  let remoteContent = null;
  let currentSave = null;

  const allowedTags = new Set('DIV SECTION SPAN P BR H1 H2 H3 H4 B STRONG I EM U UL OL LI A FIGURE FIGCAPTION IMG BLOCKQUOTE HR SMALL'.split(' '));
  const dropTags = new Set('SCRIPT STYLE IFRAME OBJECT EMBED SVG MATH FORM INPUT BUTTON TEXTAREA SELECT VIDEO AUDIO LINK META'.split(' '));
  const allowedClasses = new Set('page-kicker lead intro signature section-heading tag news-list news-row news-date news-title feature-photo doc-links doc-link accent-note'.split(' '));
  function safeURL(candidate, image) {
    const v = String(candidate || '').trim();
    if (!v || /^[\s\u0000-\u001f]*\/\//.test(v) || /[\u0000-\u001f]/.test(v)) return null;
    if (/^(https?:)\/\//i.test(v)) return v;
    if (!image && /^(mailto:|tel:)/i.test(v)) return v;
    if (/^[./#a-z\u00c0-\u024f0-9_-][^:]*$/i.test(v)) return v;
    return null;
  }
  function cleanHTML(html) {
    const source = new DOMParser().parseFromString('<main>' + String(html ?? '') + '</main>', 'text/html').querySelector('main');
    const container = document.createElement('div');
    function copy(src, parent) {
      if (src.nodeType === Node.TEXT_NODE) { parent.appendChild(document.createTextNode(src.nodeValue)); return; }
      if (src.nodeType !== Node.ELEMENT_NODE || dropTags.has(src.tagName)) return;
      if (!allowedTags.has(src.tagName)) { Array.from(src.childNodes).forEach(child => copy(child, parent)); return; }
      const el = document.createElement(src.tagName.toLowerCase());
      const classes = Array.from(src.classList).filter(c => allowedClasses.has(c));
      if (classes.length) el.className = classes.join(' ');
      if (src.id === 'aktuell' && src.tagName.startsWith('H')) el.id = 'aktuell';
      if (src.tagName === 'A') {
        const href = safeURL(src.getAttribute('href'), false);
        if (href) el.setAttribute('href', href);
        if (src.getAttribute('target') === '_blank') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      }
      if (src.tagName === 'IMG') {
        const url = safeURL(src.getAttribute('src'), true);
        if (!url) return;
        el.setAttribute('src', url);
        el.setAttribute('alt', src.getAttribute('alt') || '');
        el.setAttribute('loading', 'lazy');
      }
      parent.appendChild(el);
      Array.from(src.childNodes).forEach(child => copy(child, el));
    }
    Array.from(source.childNodes).forEach(child => copy(child, container));
    return container.innerHTML;
  }
  function normalize(c) {
    return {
      homeHtml: cleanHTML(c?.homeHtml ?? defaults?.homeHtml ?? ''),
      aktuellHtml: cleanHTML(c?.aktuellHtml ?? defaults?.aktuellHtml ?? '')
    };
  }
  function applyContent(raw) {
    if (!isHome || !raw || editing) return;
    const v = normalize(raw);
    sections.home.innerHTML = v.homeHtml;
    sections.aktuell.innerHTML = v.aktuellHtml;
  }
  function storageGet(which) { try { return which.getItem(EDIT_KEY); } catch { return null; } }
  function storageSet(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
  function demoGet() { try { return sessionStorage.getItem(DEMO_SESSION) === '1'; } catch { return false; } }
  function demoSet(on) { try { on ? sessionStorage.setItem(DEMO_SESSION,'1') : sessionStorage.removeItem(DEMO_SESSION); } catch {} }
  function make(tag, className, text) { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; }
  const modal = make('div','admin-modal');
  modal.id='admin-modal'; modal.hidden = true;
  modal.innerHTML = `<div class="admin-modal-backdrop" data-dismiss="true"></div>
    <section class="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title" tabindex="-1">
      <div class="admin-dialog-head"><div><div class="admin-dialog-kicker">KOBOM · Verwaltung</div><h2 id="admin-dialog-title">Admin Login</h2></div><button type="button" class="admin-dialog-close" id="admin-close" aria-label="Fenster schliessen">×</button></div>
      <div id="admin-auth-area"></div><p class="admin-message" id="admin-message" role="status" aria-live="polite"></p>
    </section>`;
  document.body.appendChild(modal);
  const authArea = modal.querySelector('#admin-auth-area');
  const message = modal.querySelector('#admin-message');
  const controls = document.getElementById('admin-home-controls');
  const toolbar = document.getElementById('admin-edit-toolbar');
  const storageNote = document.getElementById('admin-storage-note');
  let previousFocus = null;
  function say(text, error=false) { message.textContent=text; message.classList.toggle('error',error); }
  function openModal() { previousFocus=document.activeElement; say(''); renderAuth(); modal.hidden=false; document.body.classList.add('admin-dialog-open'); modal.querySelector('.admin-dialog').focus(); }
  function closeModal() { modal.hidden=true; document.body.classList.remove('admin-dialog-open'); previousFocus?.focus?.(); }
  function updateAdmin() {
    document.querySelectorAll('[data-admin-login]').forEach(btn => btn.textContent = admin ? 'Admin · Angemeldet' : 'Admin Login');
    if (controls) controls.hidden=!admin;
    if (storageNote) { storageNote.hidden=!admin || connected; }
    const label=document.getElementById('admin-status-label');
    if (label) label.textContent = connected ? 'Admin · Supabase' : 'Demo · nur in diesem Browser';
    const save=document.getElementById('admin-save');
    if (save) save.textContent = connected ? 'Änderungen veröffentlichen' : 'Lokal speichern';
  }
  function renderAuth() {
    authArea.replaceChildren();
    if (admin) {
      const p=make('p','',connected?'Sie sind als Administrator angemeldet. Änderungen an „Home“ und „Aktuell“ werden in Supabase gespeichert.':'Sie befinden sich in der lokalen Admin-Vorschau. Ihre Änderungen sind nur in diesem Browser sichtbar.');
      authArea.appendChild(p);
      if (!isHome) { const a=make('a','button admin-modal-primary','Home & Aktuell bearbeiten →'); a.href='index.html'; authArea.appendChild(a); }
      else { const btn=make('button','button admin-modal-primary','Zur Seite & Bearbeitung'); btn.type='button'; btn.addEventListener('click',closeModal); authArea.appendChild(btn); }
      const btn=make('button','admin-text-btn','Abmelden'); btn.type='button'; btn.addEventListener('click',logout); authArea.appendChild(btn);
      return;
    }
    if (!connected) {
      authArea.appendChild(make('p','','Diese Version bietet einen lokalen Bearbeitungsmodus zum Ausprobieren. Ein echter, passwortgeschützter Login folgt mit der Supabase-Anbindung.'));
      const notice=make('p','admin-warning','Wichtig: Demo-Modus ist keine Zugangssicherung. Änderungen werden nicht für andere Besucher veröffentlicht.'); authArea.appendChild(notice);
      const btn=make('button','button admin-modal-primary','Lokale Admin-Demo starten'); btn.type='button'; btn.addEventListener('click',()=>{admin=true;demoSet(true);updateAdmin();renderAuth(); if (isHome) closeModal(); else window.location.href='index.html';});authArea.appendChild(btn);
      return;
    }
    const form=make('form','admin-login-form');
    form.innerHTML=`<label>E-Mail <input name="email" type="email" required autocomplete="username" placeholder="admin@beispiel.ch"></label>
      <label>Passwort <input name="password" type="password" required autocomplete="current-password" minlength="8"></label>
      <button class="button admin-modal-primary" type="submit">Sicher anmelden</button>`;
    form.addEventListener('submit',async e=>{
      e.preventDefault();const submit=form.querySelector('button');submit.disabled=true;say('Anmeldung wird geprüft …');
      const fd=new FormData(form);
      try {
        if(!db) throw new Error('Supabase ist momentan nicht erreichbar.');
        const {error}=await db.auth.signInWithPassword({email:fd.get('email'),password:fd.get('password')});
        if(error) throw error;
        const ok=await verifyAdmin();
        if(!ok){await db.auth.signOut();throw new Error('Dieses Benutzerkonto hat keine Admin-Berechtigung.');}
        admin=true; updateAdmin(); renderAuth();say('Anmeldung erfolgreich.');
        if(isHome) closeModal();else window.location.href='index.html';
      }catch(err){say(err.message || 'Anmeldung fehlgeschlagen.',true);}finally{submit.disabled=false;}
    });
    authArea.appendChild(form);
  }
  async function verifyAdmin(){
    if(!db)return false;
    const {data:{user},error}=await db.auth.getUser();
    if(error||!user)return false;
    const result=await db.rpc('is_site_admin');
    return !result.error && result.data === true;
  }
  async function logout(){
    if(editing) cancelEdit();
    if(connected && db) await db.auth.signOut();
    demoSet(false);admin=false;updateAdmin();renderAuth();closeModal();
  }
  function editRegion(region){
    if(!admin||!isHome||!sections[region])return;
    if(editing) cancelEdit();
    editing=region;beforeEdit=sections[region].innerHTML;
    const target=sections[region]; target.setAttribute('contenteditable','true');target.classList.add('admin-region-editing');
    toolbar.hidden=false;
    document.getElementById('admin-edit-label').textContent=region==='home'?'Home bearbeiten':'Aktuell bearbeiten';
    document.getElementById('admin-save').disabled=false;
    toolbar.querySelectorAll('[data-format]').forEach(b=>b.disabled=false);
    target.focus(); target.scrollIntoView({behavior:'smooth',block:'center'});
    // Help prevent clicking edit-time links; users can still change link text.
  }
  function cancelEdit(){
    if(!editing)return;
    const target=sections[editing];target.innerHTML=beforeEdit;target.removeAttribute('contenteditable');target.classList.remove('admin-region-editing');
    editing=null;beforeEdit=null;toolbar.hidden=true;
  }
  async function commit(newDoc){
    if(!connected){
      if(!storageSet(EDIT_KEY, JSON.stringify(newDoc))) throw new Error('Speichern im Browser nicht möglich. Bitte die Website über einen lokalen Server statt file:// öffnen.');
    }else{
      if(!db)throw new Error('Keine Supabase-Verbindung.');
      const {data:{user}}=await db.auth.getUser();
      if(!user)throw new Error('Bitte erneut anmelden.');
      const {error}=await db.from('site_pages').upsert({slug:'home',content:newDoc,updated_at:new Date().toISOString(),updated_by:user.id},{onConflict:'slug'});
      if(error)throw error;
      remoteContent=newDoc;
    }
  }
  async function saveEdit(){
    if(!editing || currentSave)return;
    const region=editing; const button=document.getElementById('admin-save');button.disabled=true;
    const doc=connected ? (remoteContent || defaults) : (JSON.parse(storageGet(localStorage)||'null')||defaults);
    const draft=normalize(doc);
    draft[region+'Html']=cleanHTML(sections[region].innerHTML);
    currentSave=commit(draft);
    try {
      await currentSave;
      sections[region].removeAttribute('contenteditable');sections[region].classList.remove('admin-region-editing');
      editing=null;beforeEdit=null;toolbar.hidden=true;
      applyContent(draft);
      toast(connected?'Änderungen veröffentlicht.':'Änderungen lokal gespeichert.');
    } catch(err){toast('Speichern fehlgeschlagen: '+(err.message || err),true);} finally {currentSave=null;button.disabled=false;}
  }
  async function resetOriginal(){
    if(!admin || !isHome)return;
    if(!confirm('Die Inhalte von Home und Aktuell auf den Originalzustand zurücksetzen?'))return;
    if(editing)cancelEdit();
    try {await commit(normalize(defaults));applyContent(defaults);toast('Originalinhalte wiederhergestellt.');}catch(err){toast(err.message||'Zurücksetzen fehlgeschlagen.',true);}
  }
  let toastTime;
  const notice=make('div','admin-toast');notice.setAttribute('role','status');notice.hidden=true;document.body.appendChild(notice);
  function toast(text,error=false){notice.textContent=text;notice.classList.toggle('is-error',error);notice.hidden=false;clearTimeout(toastTime);toastTime=setTimeout(()=>notice.hidden=true,4300);}
  function bindActions(){
    document.querySelectorAll('[data-admin-login]').forEach(btn=>btn.addEventListener('click',openModal));
    modal.querySelector('#admin-close').addEventListener('click',closeModal);
    modal.querySelector('[data-dismiss]').addEventListener('click',closeModal);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!modal.hidden)closeModal();else if(editing)cancelEdit();}});
    document.querySelectorAll('[data-admin-edit]').forEach(btn=>btn.addEventListener('click',()=>editRegion(btn.dataset.adminEdit)));
    document.getElementById('admin-cancel')?.addEventListener('click',cancelEdit);
    document.getElementById('admin-save')?.addEventListener('click',saveEdit);
    document.getElementById('admin-reset')?.addEventListener('click',resetOriginal);
    document.getElementById('admin-logout-top')?.addEventListener('click',logout);
    document.querySelectorAll('[data-format]').forEach(btn=>{
      btn.addEventListener('mousedown',e=>e.preventDefault());
      btn.addEventListener('click',()=>{
        if(!editing)return;
        sections[editing].focus();
        let value;
        if(btn.dataset.format==='createLink') {
          value=prompt('Link-Adresse (https:// oder interne Seite):');
          if(!value)return;
          if(!safeURL(value,false)){toast('Diese Link-Adresse ist nicht erlaubt.',true);return;}
        }
        document.execCommand(btn.dataset.format,false,value ?? null);
      });
    });
    Object.values(sections).forEach(section=>section.addEventListener('click',e=>{if(editing && e.target.closest('a'))e.preventDefault();}));
    window.addEventListener('beforeunload',e=>{if(editing){e.preventDefault();e.returnValue='';}});
  }
  async function initSupabase(){
    if(!connected) {
      admin=demoGet();
      if(isHome){const saved=storageGet(localStorage);if(saved){try{applyContent(JSON.parse(saved));}catch{}}}
      updateAdmin();return;
    }
    try {
      const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      db=createClient(config.url,config.publishableKey || config.anonKey);
      if(isHome){
        const {data,error}=await db.from('site_pages').select('content').eq('slug','home').maybeSingle();
        if(!error && data?.content){remoteContent=normalize(data.content);applyContent(remoteContent);}
      }
      admin=await verifyAdmin();updateAdmin();
      db.auth.onAuthStateChange((_event,session)=>{if(!session && admin){admin=false;if(editing)cancelEdit();updateAdmin();}});
    }catch(err){
      console.warn('KOBOM: Supabase nicht verfügbar',err);
      say('Supabase ist nicht erreichbar. Bitte Verbindung prüfen.',true);
    }
  }
  bindActions();
  updateAdmin();
  initSupabase();
})();
