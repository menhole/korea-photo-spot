(() => {
  const $ = id => document.getElementById(id);
  const cfg = window.APP_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_PUBLISHABLE_KEY && !String(cfg.SUPABASE_URL).includes('YOUR_') && !String(cfg.SUPABASE_PUBLISHABLE_KEY).includes('YOUR_');
  const sb = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY) : null;
  const DIARY_BUCKET = 'private-diary';
  let user = null, wishlistMap, visitedMap, discoverMap;
  let wishlistPoint = null, diaryPoint = null;
  let wishlistMarkers = [], visitedMarkers = [], discoverMarkers = [];
  let myPlaces = [], diaries = [], catalog = [];
  let selectedTag = 'all';
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tagsFrom = value => String(value || '').split(',').map(x => x.trim().replace(/^#/,'')).filter(Boolean).slice(0,12);
  const tagsHtml = tags => (tags || []).map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('');
  function toast(message){ $('toast').textContent=message; $('toast').classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('toast').classList.remove('show'),2800); }
  function requireLogin(){ if(user) return true; $('authDialog').showModal(); $('authMessage').textContent='기록을 저장하려면 먼저 로그인해 주세요.'; return false; }
  function makeMap(id, center=[37.5665,126.9780], zoom=11){
    const map=L.map(id).setView(center,zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    return map;
  }
  function clearMarkers(list,map){list.forEach(m=>map.removeLayer(m));list.length=0;}
  function marker(map,list,lat,lng,title,fn){
    if(lat==null||lng==null||!Number.isFinite(Number(lat))||!Number.isFinite(Number(lng)))return;
    const m=L.marker([Number(lat),Number(lng)]).addTo(map).bindPopup(escapeHtml(title||'장소'));
    if(fn)m.on('click',fn); list.push(m);
  }
  function initMaps(){
    wishlistMap=makeMap('wishlistMap'); visitedMap=makeMap('visitedMap'); discoverMap=makeMap('discoverMap');
    wishlistMap.on('click',e=>{wishlistPoint={lat:e.latlng.lat,lng:e.latlng.lng};$('placeCoords').textContent=`선택 위치: ${wishlistPoint.lat.toFixed(5)}, ${wishlistPoint.lng.toFixed(5)}`;});
    visitedMap.on('click',e=>{diaryPoint={lat:e.latlng.lat,lng:e.latlng.lng};$('diaryCoords').textContent=`선택 위치: ${diaryPoint.lat.toFixed(5)}, ${diaryPoint.lng.toFixed(5)}`;});
  }
  function switchTab(name){
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    $(`${name}View`).classList.add('active');
    setTimeout(()=>{({wishlist:wishlistMap,visited:visitedMap,discover:discoverMap}[name])?.invalidateSize();},80);
  }
  async function authRefresh(){
    if(!sb){$('authStatus').textContent='설정 필요';$('authOpen').classList.remove('hidden');$('logoutBtn').classList.add('hidden');return;}
    const {data}=await sb.auth.getSession(); user=data.session?.user||null;
    $('authStatus').textContent=user?(user.email||'로그인됨'):'로그인 전';
    $('authOpen').classList.toggle('hidden',!!user); $('logoutBtn').classList.toggle('hidden',!user);
  }
  async function authAction(mode){
    if(!sb){$('authMessage').textContent='config.js의 Supabase URL과 Publishable key를 확인해 주세요.';return;}
    const email=$('emailInput').value.trim(),password=$('passwordInput').value;
    if(!email||password.length<6){$('authMessage').textContent='이메일과 6자 이상의 비밀번호를 입력해 주세요.';return;}
    $('authMessage').textContent='처리 중...';
    const result=mode==='signup'?await sb.auth.signUp({email,password}):await sb.auth.signInWithPassword({email,password});
    if(result.error){$('authMessage').textContent=result.error.message;return;}
    if(mode==='signup'&&!result.data.session){$('authMessage').textContent='가입 요청이 완료됐어요. 이메일 확인 후 로그인해 주세요.';return;}
    await authRefresh(); if(user){$('authDialog').close();await loadPrivateData();toast('로그인했어요.');}
  }
  async function loadPrivateData(){
    if(!sb||!user){myPlaces=[];diaries=[];catalog=[];renderAll();return;}
    const [p,d,c]=await Promise.all([
      sb.from('my_places').select('*').order('created_at',{ascending:false}),
      sb.from('diary_entries').select('*').order('visited_on',{ascending:false}),
      sb.from('photo_spots').select('*').order('region').order('name')
    ]);
    if(p.error||d.error||c.error){toast('자료를 불러오지 못했어요: '+(p.error||d.error||c.error).message);return;}
    myPlaces=p.data||[]; diaries=d.data||[]; catalog=c.data||[];
    for(const entry of diaries){ if(entry.photo_path){const {data}=await sb.storage.from(DIARY_BUCKET).createSignedUrl(entry.photo_path,3600);entry.photo_signed=data?.signedUrl||'';} }
    renderAll();
  }
  function renderWishlist(){
    clearMarkers(wishlistMarkers,wishlistMap);
    const rows=myPlaces.filter(p=>p.status==='wishlist');
    rows.forEach(p=>marker(wishlistMap,wishlistMarkers,p.lat,p.lng,p.name,()=>openPlace(p)));
    $('wishlistCount').textContent=`${rows.length}곳`;
    $('wishlistList').innerHTML=rows.map(p=>`<article class="place-card"><span class="tag">${escapeHtml(p.region||p.category)}</span><h4>${escapeHtml(p.name)}</h4><p>${escapeHtml(p.note||'저장한 장소')}</p><div>${tagsHtml(p.tags)}</div><div class="card-actions"><button class="button secondary" data-visit="${p.id}">다녀왔어요</button><button class="button secondary" data-showplace="${p.id}">지도에서 보기</button><button class="button ghost" data-deleteplace="${p.id}">삭제</button></div></article>`).join('')||'<p class="empty">아직 저장한 장소가 없어요. 지도에서 위치를 선택하고 장소를 저장해 보세요.</p>';
  }
  function renderDiaries(){
    clearMarkers(visitedMarkers,visitedMap);
    const visitedPlaces=myPlaces.filter(p=>p.status==='visited');
    visitedPlaces.forEach(p=>marker(visitedMap,visitedMarkers,p.lat,p.lng,p.name,()=>openPlace(p)));
    diaries.forEach(d=>marker(visitedMap,visitedMarkers,d.lat,d.lng,d.place_name,()=>openDiary(d)));
    $('diaryCount').textContent=`${diaries.length}개 일기 · ${visitedPlaces.length}곳 방문`;
    $('diaryList').innerHTML=diaries.map(d=>`<article class="diary-card">${d.photo_signed?`<img class="diary-photo" src="${escapeHtml(d.photo_signed)}" alt="${escapeHtml(d.place_name)} 사진">`:''}<span class="tag">${escapeHtml(d.visited_on)}</span><h4>${escapeHtml(d.place_name)}</h4><p>${escapeHtml(d.body||'기록 없음')}</p><div>${tagsHtml(d.tags)}</div><div class="card-actions"><button class="button secondary" data-showdiary="${d.id}">지도에서 보기</button><button class="button ghost" data-deletediary="${d.id}">삭제</button></div></article>`).join('')||'<p class="empty">아직 작성한 일기가 없어요. 다녀온 장소와 사진을 기록해 보세요.</p>';
  }
  function renderDiscover(){
    clearMarkers(discoverMarkers,discoverMap);
    const q=$('discoverSearch').value.trim().toLowerCase(), region=$('discoverRegion').value;
    const rows=catalog.filter(s=>(region==='all'||s.region.includes(region))&&(!q||`${s.name} ${s.region} ${s.description}`.toLowerCase().includes(q))&&(selectedTag==='all'||(s.tags||[]).includes(selectedTag)));
    rows.forEach(s=>marker(discoverMap,discoverMarkers,s.lat,s.lng,s.name,()=>openCatalog(s)));
    $('discoverCount').textContent=`${rows.length}곳`;
    $('discoverList').innerHTML=rows.map(s=>`<article class="place-card"><div class="spot-cover">📍</div><span class="tag">${escapeHtml(s.region)}</span><h4>${escapeHtml(s.name)}</h4><p>${escapeHtml(s.description)}</p><div>${tagsHtml(s.tags)}</div><div class="card-actions"><button class="button primary" data-savecatalog="${s.id}">가고 싶은 곳에 저장</button><button class="button secondary" data-centercatalog="${s.id}">지도에서 보기</button></div><p class="fine">출처 메모: ${escapeHtml(s.source_note||'장소 기본 정보')}</p></article>`).join('')||'<p class="empty">검색 결과가 없어요.</p>';
  }
  function renderAll(){renderWishlist();renderDiaries();renderDiscover();}
  function openPlace(p){
    $('detailContent').innerHTML=`<p class="eyebrow">MY PLACE</p><h2>${escapeHtml(p.name)}</h2><p class="detail-text">${escapeHtml(p.note||'메모 없음')}</p><p>${tagsHtml(p.tags)}</p><div class="card-actions"><button id="detailRoute" class="button primary">길찾기</button></div>`;
    $('detailDialog').showModal();$('detailRoute').onclick=()=>window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.lat},${p.lng}`)}`,'_blank','noopener');
  }
  function openDiary(d){$('detailContent').innerHTML=`<p class="eyebrow">TRAVEL DIARY · ${escapeHtml(d.visited_on)}</p><h2>${escapeHtml(d.place_name)}</h2>${d.photo_signed?`<img class="detail-photo" src="${escapeHtml(d.photo_signed)}" alt="방문 사진">`:''}<p class="detail-text">${escapeHtml(d.body||'')}</p><p>${tagsHtml(d.tags)}</p>`;$('detailDialog').showModal();}
  function openCatalog(s){
    $('detailContent').innerHTML=`<p class="eyebrow">PHOTO SPOT · ${escapeHtml(s.region)}</p><h2>${escapeHtml(s.name)}</h2><p class="detail-text">${escapeHtml(s.description)}</p><p>${tagsHtml(s.tags)}</p><div class="card-actions"><button id="detailSave" class="button primary">가고 싶은 곳에 저장</button><button id="detailRoute" class="button secondary">길찾기</button></div>`;
    $('detailDialog').showModal();$('detailSave').onclick=()=>saveCatalog(s);$('detailRoute').onclick=()=>window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${s.lat},${s.lng}`)}`,'_blank','noopener');
  }
  async function saveCatalog(s){
    if(!requireLogin())return;
    const {error}=await sb.from('my_places').insert({user_id:user.id,name:s.name,region:s.region,category:s.category,note:s.description,status:'wishlist',lat:s.lat,lng:s.lng,tags:s.tags||[]});
    if(error){toast('저장 실패: '+error.message);return;} $('detailDialog').close();await loadPrivateData();toast('가고 싶은 곳에 저장했어요.');
  }
  async function saveWishlist(e){
    e.preventDefault();if(!requireLogin())return;
    const name=$('placeName').value.trim();if(!name)return;
    const row={user_id:user.id,name,region:$('placeRegion').value.trim(),category:$('placeCategory').value,note:$('placeNote').value.trim(),tags:tagsFrom($('placeTags').value),status:'wishlist',lat:wishlistPoint?.lat??null,lng:wishlistPoint?.lng??null};
    const {error}=await sb.from('my_places').insert(row);if(error){toast('저장 실패: '+error.message);return;}
    $('placeForm').reset();wishlistPoint=null;$('placeCoords').textContent='지도를 눌러 위치를 선택해 주세요.';$('placeDialog').close();await loadPrivateData();toast('장소를 저장했어요.');
  }
  async function markVisited(id){
    const {error}=await sb.from('my_places').update({status:'visited',visited_at:new Date().toISOString().slice(0,10)}).eq('id',id).eq('user_id',user.id);
    if(error){toast('변경 실패: '+error.message);return;}await loadPrivateData();toast('다녀온 곳으로 옮겼어요. 일기는 별도로 작성할 수 있어요.');
  }
  async function deletePlace(id){if(!confirm('이 장소를 내 목록에서 삭제할까요?'))return;const {error}=await sb.from('my_places').delete().eq('id',id).eq('user_id',user.id);if(error){toast(error.message);return;}await loadPrivateData();}
  async function uploadDiaryPhoto(file){
    if(!file)return null;if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('JPG, PNG, WEBP 사진만 첨부할 수 있어요.');if(file.size>5*1024*1024)throw new Error('사진은 5MB 이하로 선택해 주세요.');
    const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg',path=`${user.id}/${crypto.randomUUID()}.${ext}`;
    const {error}=await sb.storage.from(DIARY_BUCKET).upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;return path;
  }
  async function saveDiary(e){
    e.preventDefault();if(!requireLogin())return;
    let photoPath=null;
    try{
      const file=$('diaryPhoto').files[0];if(file)photoPath=await uploadDiaryPhoto(file);
      const row={user_id:user.id,place_name:$('diaryPlace').value.trim(),visited_on:$('diaryDate').value,body:$('diaryText').value.trim(),tags:tagsFrom($('diaryTags').value),photo_path:photoPath,lat:diaryPoint?.lat??null,lng:diaryPoint?.lng??null};
      const {error}=await sb.from('diary_entries').insert(row);if(error)throw error;
      $('diaryForm').reset();diaryPoint=null;$('diaryCoords').textContent='선택한 위치: 없음 (방문 장소는 지도에서 선택할 수 있어요.)';$('diaryDialog').close();await loadPrivateData();toast('방문 일기를 저장했어요.');
    }catch(err){if(photoPath)await sb.storage.from(DIARY_BUCKET).remove([photoPath]);toast('일기 저장 실패: '+err.message);}
  }
  async function deleteDiary(id){if(!confirm('이 일기를 삭제할까요?'))return;const d=diaries.find(x=>x.id===id);const {error}=await sb.from('diary_entries').delete().eq('id',id).eq('user_id',user.id);if(error){toast(error.message);return;}if(d?.photo_path)await sb.storage.from(DIARY_BUCKET).remove([d.photo_path]);await loadPrivateData();}
  function showOnMap(map,lat,lng){if(lat!=null&&lng!=null){map.setView([lat,lng],15);}}
  document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
  $('authOpen').onclick=()=>$('authDialog').showModal();$('signInBtn').onclick=()=>authAction('signin');$('signUpBtn').onclick=()=>authAction('signup');
  $('logoutBtn').onclick=async()=>{if(sb){await sb.auth.signOut();await authRefresh();await loadPrivateData();toast('로그아웃했어요.');}};
  $('addWishlistBtn').onclick=()=>{if(requireLogin()){$('placeCoords').textContent='지도에서 위치를 선택하거나 비워 둘 수 있어요.';$('placeDialog').showModal();}};
  $('addDiaryBtn').onclick=()=>{if(requireLogin()){$('diaryDate').value=new Date().toISOString().slice(0,10);$('diaryDialog').showModal();}};
  $('placeForm').addEventListener('submit',saveWishlist);$('diaryForm').addEventListener('submit',saveDiary);
  $('discoverSearch').addEventListener('input',renderDiscover);$('discoverRegion').addEventListener('change',renderDiscover);
  $('tagFilters').addEventListener('click',e=>{const b=e.target.closest('[data-tag]');if(!b)return;selectedTag=b.dataset.tag;document.querySelectorAll('.chip').forEach(x=>x.classList.toggle('active',x===b));renderDiscover();});
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-visit],[data-deleteplace],[data-showplace],[data-showdiary],[data-deletediary],[data-savecatalog],[data-centercatalog]');if(!t)return;
    if(t.dataset.visit)markVisited(t.dataset.visit);
    if(t.dataset.deleteplace)deletePlace(t.dataset.deleteplace);
    if(t.dataset.showplace){const p=myPlaces.find(x=>x.id===t.dataset.showplace);if(p)showOnMap(wishlistMap,p.lat,p.lng);}
    if(t.dataset.showdiary){const d=diaries.find(x=>x.id===t.dataset.showdiary);if(d){showOnMap(visitedMap,d.lat,d.lng);openDiary(d);}}
    if(t.dataset.deletediary)deleteDiary(t.dataset.deletediary);
    if(t.dataset.savecatalog){const s=catalog.find(x=>x.id===t.dataset.savecatalog);if(s)saveCatalog(s);}
    if(t.dataset.centercatalog){const s=catalog.find(x=>x.id===t.dataset.centercatalog);if(s)showOnMap(discoverMap,s.lat,s.lng);}
  });
  initMaps();
  if(sb){authRefresh().then(loadPrivateData);sb.auth.onAuthStateChange(async()=>{await authRefresh();await loadPrivateData();});}
  else{toast('시작하려면 기존 config.js에 Supabase URL과 Publishable key가 설정되어 있어야 해요.');renderAll();}
})();
