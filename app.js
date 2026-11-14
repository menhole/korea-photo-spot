(() => {
  const $ = id => document.getElementById(id);
  const cfg = window.APP_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_PUBLISHABLE_KEY && !String(cfg.SUPABASE_URL).includes('YOUR_') && !String(cfg.SUPABASE_PUBLISHABLE_KEY).includes('YOUR_');
  const sb = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY) : null;
  const DIARY_BUCKET = 'private-diary';
  let user = null, wishlistMap, visitedMap;
  let wishlistPoint = null, diaryPoint = null;
  let wishlistMarkers = [], visitedMarkers = [];
  let myPlaces = [], diaries = [], catalog = [], notes = [], buckets = [], events = [];
  let bucketFilter='all', calendarCursor=new Date(), selectedCalendarDate=new Date().toISOString().slice(0,10);
  let selectedTag = 'all';
  let liveCatalog = [];
  let lastLiveQuery = '';
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
    wishlistMap=makeMap('wishlistMap'); visitedMap=makeMap('visitedMap');
    wishlistMap.on('click',e=>{wishlistPoint={lat:e.latlng.lat,lng:e.latlng.lng};$('placeCoords').textContent=`선택 위치: ${wishlistPoint.lat.toFixed(5)}, ${wishlistPoint.lng.toFixed(5)}`;});
    visitedMap.on('click',e=>{diaryPoint={lat:e.latlng.lat,lng:e.latlng.lng};$('diaryCoords').textContent=`선택 위치: ${diaryPoint.lat.toFixed(5)}, ${diaryPoint.lng.toFixed(5)}`;});
  }
  function switchTab(name){
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    $(`${name}View`).classList.add('active');
    setTimeout(()=>{if(name==='map'){wishlistMap?.invalidateSize();visitedMap?.invalidateSize();}},80);
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
    const [p,d,n,b,e]=await Promise.all([
      sb.from('my_places').select('*').order('created_at',{ascending:false}),
      sb.from('diary_entries').select('*').order('visited_on',{ascending:false}),
      sb.from('travel_notes').select('*').order('created_at',{ascending:false}),
      sb.from('travel_buckets').select('*').order('created_at',{ascending:false}),
      sb.from('travel_events').select('*').order('event_date',{ascending:true})
    ]);
    if(p.error||d.error||n.error||b.error||e.error){toast('자료를 불러오지 못했어요: '+(p.error||d.error||n.error||b.error||e.error).message+' · 새 기능용 SQL을 먼저 실행해 주세요.');return;}
    myPlaces=p.data||[]; diaries=d.data||[]; notes=n.data||[]; buckets=b.data||[]; events=e.data||[]; catalog=[];
    for(const entry of diaries){ if(entry.photo_path){const {data}=await sb.storage.from(DIARY_BUCKET).createSignedUrl(entry.photo_path,3600);entry.photo_signed=data?.signedUrl||'';} }
    renderAll();renderNotes();renderBuckets();renderCalendar();
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
    const q=$('discoverSearch').value.trim().toLowerCase(), region=$('discoverRegion').value;
    const rows=catalog.filter(s=>(region==='all'||String(s.region||'').includes(region))&&(!q||`${s.name} ${s.region} ${s.description}`.toLowerCase().includes(q))&&(selectedTag==='all'||(s.tags||[]).includes(selectedTag)));
    $('discoverCount').textContent=`${rows.length}곳`;
    $('discoverList').innerHTML=rows.map(s=>`<article class="place-card"><div class="spot-cover">📍</div><span class="tag">${escapeHtml(s.region)}</span><h4>${escapeHtml(s.name)}</h4><p>${escapeHtml(s.description)}</p><div>${tagsHtml(s.tags)}</div><div class="card-actions"><button class="button primary" data-savecatalog="${s.id}">가고 싶은 곳에 저장</button></div><p class="fine">출처 메모: ${escapeHtml(s.source_note||'장소 기본 정보')}</p></article>`).join('')||'<p class="empty">저장된 명소가 없어요.</p>';
    $('liveDiscoverCount').textContent=liveCatalog.length?`${liveCatalog.length}개 검색 결과`:'검색 전';
    $('liveDiscoverList').innerHTML=liveCatalog.map(s=>`<article class="place-card live-result"><span class="tag">${escapeHtml(s.region||'웹 검색')}</span><h4>${escapeHtml(s.name)}</h4><p>${escapeHtml(s.description||'원문에서 자세한 내용을 확인해 주세요.')}</p><p class="fine">${s.published_date?`게시일: ${escapeHtml(s.published_date)} · `:''}${escapeHtml(s.source_host||'웹 검색')}</p><div class="card-actions"><a class="button secondary" href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">원문 보기</a><button class="button primary" data-savelive="${escapeHtml(s.id)}">가고 싶은 곳에 저장</button></div></article>`).join('')||'<p class="empty">지역과 테마를 선택한 뒤 실시간 검색을 눌러 보세요.</p>';
  }
  function buildDiscoveryQuery(){
    const region=$('discoverRegion').value, keyword=$('discoverSearch').value.trim();
    const theme=selectedTag==='all'?'사진 명소':`${selectedTag} 사진 명소`;
    const area=region==='all'?'대한민국':region;
    return [area,theme,keyword].filter(Boolean).join(' ');
  }
  function updateExternalSearchLinks(){
    const encoded=encodeURIComponent(buildDiscoveryQuery());
    $('naverSearchLink').href=`https://search.naver.com/search.naver?query=${encoded}`;
    $('googleSearchLink').href=`https://www.google.com/search?q=${encoded}`;
  }
  async function runLiveSearch(){
    const query=buildDiscoveryQuery();
    if(!query.trim()){toast('검색어를 입력해 주세요.');return;}
    updateExternalSearchLinks();$('liveSearchBtn').disabled=true;$('liveSearchBtn').textContent='검색 중...';
    $('liveSearchStatus').textContent='실시간 검색을 요청하고 있어요.';
    if(!sb){liveCatalog=[];$('liveSearchStatus').textContent='Supabase 설정이 없어 사이트 내 검색을 사용할 수 없어요. 아래 외부 검색 버튼을 이용해 주세요.';$('liveDiscoverCount').textContent='외부 검색 이용 가능';renderDiscover();$('liveSearchBtn').disabled=false;$('liveSearchBtn').textContent='⌕ 실시간 검색';return;}
    try{
      const {data,error}=await sb.functions.invoke('photo-spot-search',{body:{region:$('discoverRegion').value,theme:selectedTag,keyword:$('discoverSearch').value.trim()}});
      if(error) throw error;
      const results=Array.isArray(data?.results)?data.results:[];
      liveCatalog=results.map((r,i)=>({id:`live-${i}-${btoa(unescape(encodeURIComponent(r.url||r.title||String(i)))).replace(/[^a-zA-Z0-9]/g,'').slice(0,18)}`,name:r.title||'이름 없는 검색 결과',region:$('discoverRegion').value==='all'?'대한민국':$('discoverRegion').value,category:selectedTag==='all'?'기타':selectedTag,description:r.content||'원문에서 자세한 내용을 확인해 주세요.',tags:selectedTag==='all'?[]:[selectedTag],url:r.url||'',published_date:r.published_date||'',source_host:r.source_host||'웹 검색'})).filter(x=>x.url.startsWith('https://')||x.url.startsWith('http://'));
      lastLiveQuery=query;$('liveSearchStatus').textContent=liveCatalog.length?`검색 완료 · ${new Date().toLocaleString('ko-KR')}`:'검색 결과가 없어요. 외부 검색도 이용해 보세요.';
      if(data?.usage?.credits!=null)$('liveSearchStatus').textContent+=` · 사용량 ${data.usage.credits}크레딧`;
      renderDiscover();
    }catch(err){liveCatalog=[];$('liveSearchStatus').textContent='사이트 내 검색을 연결하지 못했어요. 외부 검색 버튼은 계속 사용할 수 있어요.';$('liveDiscoverCount').textContent='API 연결 필요';renderDiscover();}
    finally{$('liveSearchBtn').disabled=false;$('liveSearchBtn').textContent='⌕ 실시간 검색';}
  }

  function renderNotes(){
    $('noteCount').textContent=`${notes.length}개`;
    $('notesList').innerHTML=notes.map(n=>`<article class="note-card"><div class="note-card-head"><h4>${escapeHtml(n.title||'제목 없는 노트')}</h4><span class="fine">${new Date(n.created_at).toLocaleDateString('ko-KR')}</span></div><p>${escapeHtml(n.body)}</p><div class="card-actions"><button class="button ghost" data-deletenote="${n.id}">삭제</button></div></article>`).join('')||'<p class="empty">아직 노트가 없어요. 첫 번째 여행 아이디어를 적어 보세요.</p>';
  }
  function renderBuckets(){
    const rows=buckets.filter(b=>bucketFilter==='all'||(bucketFilter==='done'?b.is_done:!b.is_done));
    $('bucketList').innerHTML=rows.map(b=>`<article class="bucket-card ${b.is_done?'is-done':''}"><div class="bucket-card-head"><label class="bucket-check"><input type="checkbox" data-togglebucket="${b.id}" ${b.is_done?'checked':''}><span></span></label><div><h3>${escapeHtml(b.title)}</h3><p>${escapeHtml(b.place||'장소 미정')}</p></div></div>${b.target_date?`<span class="tag">목표일 ${escapeHtml(b.target_date)}</span>`:''}<p class="bucket-memo">${escapeHtml(b.memo||'')}</p><div class="card-actions"><button class="button ghost" data-deletebucket="${b.id}">삭제</button></div></article>`).join('')||'<p class="empty">아직 버킷리스트가 없어요. 가보고 싶은 곳이나 해보고 싶은 일을 추가해 보세요.</p>';
  }
  function renderCalendar(){
    const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth();$('calendarMonth').textContent=`${y}년 ${m+1}월`;
    const first=new Date(y,m,1),start=first.getDay(),days=new Date(y,m+1,0).getDate();
    const labels=['일','월','화','수','목','금','토'];let html=labels.map(x=>`<div class="calendar-weekday">${x}</div>`).join('');
    for(let i=0;i<start;i++)html+='<div class="calendar-day empty-day"></div>';
    for(let d=1;d<=days;d++){const key=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,count=events.filter(e=>e.event_date===key).length;html+=`<button class="calendar-day ${selectedCalendarDate===key?'selected':''}" data-selectdate="${key}"><span>${d}</span>${count?`<i>${count}</i>`:''}</button>`;}
    $('calendarGrid').innerHTML=html;renderSelectedEvents();
  }
  function renderSelectedEvents(){
    $('selectedDateTitle').textContent=`${selectedCalendarDate} 일정`;const rows=events.filter(e=>e.event_date===selectedCalendarDate);
    $('selectedDateEvents').innerHTML=rows.map(e=>`<article class="event-row"><div><b>${escapeHtml(e.title)}</b><p>${escapeHtml(e.place||'장소 미정')} ${e.memo?`· ${escapeHtml(e.memo)}`:''}</p></div><button class="button ghost" data-deleteevent="${e.id}">삭제</button></article>`).join('')||'<p class="empty">이 날짜에는 일정이 없어요.</p>';
  }
  async function saveNote(e){e.preventDefault();if(!requireLogin())return;const title=$('noteTitle').value.trim(),body=$('noteBody').value.trim();if(!body)return;const {error}=await sb.from('travel_notes').insert({user_id:user.id,title,body});if(error){toast('노트 저장 실패: '+error.message);return;}$('noteForm').reset();$('noteDialog').close();await loadPrivateData();toast('노트를 저장했어요.');}
  async function saveQuickNote(){if(!requireLogin())return;const body=$('quickNote').value.trim();if(!body){toast('먼저 내용을 적어 주세요.');return;}const {error}=await sb.from('travel_notes').insert({user_id:user.id,title:'빠른 메모',body});if(error){toast('노트 저장 실패: '+error.message);return;}$('quickNote').value='';await loadPrivateData();toast('노트를 저장했어요.');}
  async function saveBucket(e){e.preventDefault();if(!requireLogin())return;const row={user_id:user.id,title:$('bucketTitle').value.trim(),place:$('bucketPlace').value.trim(),target_date:$('bucketDate').value||null,memo:$('bucketMemo').value.trim()};const {error}=await sb.from('travel_buckets').insert(row);if(error){toast('버킷리스트 저장 실패: '+error.message);return;}$('bucketForm').reset();$('bucketDialog').close();await loadPrivateData();toast('버킷리스트에 추가했어요.');}
  async function toggleBucket(id,done){const {error}=await sb.from('travel_buckets').update({is_done:done}).eq('id',id).eq('user_id',user.id);if(error){toast(error.message);return;}await loadPrivateData();}
  async function saveEvent(e){e.preventDefault();if(!requireLogin())return;const row={user_id:user.id,title:$('eventTitle').value.trim(),event_date:$('eventDate').value,place:$('eventPlace').value.trim(),memo:$('eventMemo').value.trim()};const {error}=await sb.from('travel_events').insert(row);if(error){toast('일정 저장 실패: '+error.message);return;}selectedCalendarDate=row.event_date;calendarCursor=new Date(row.event_date+'T12:00:00');$('eventForm').reset();$('eventDialog').close();await loadPrivateData();toast('일정을 저장했어요.');}
  async function deleteOwned(table,id){if(!confirm('삭제할까요?'))return;const {error}=await sb.from(table).delete().eq('id',id).eq('user_id',user.id);if(error){toast(error.message);return;}await loadPrivateData();}

  function renderAll(){renderWishlist();renderDiaries();renderNotes();renderBuckets();renderCalendar();}
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
    const {error}=await sb.from('my_places').insert({user_id:user.id,name:String(s.name||'').slice(0,100),region:s.region,category:s.category,note:[s.description,s.url?`출처: ${s.url}`:''].filter(Boolean).join('\n\n'),status:'wishlist',lat:s.lat??null,lng:s.lng??null,tags:s.tags||[]});
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
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-visit],[data-deleteplace],[data-showplace],[data-showdiary],[data-deletediary],[data-savecatalog],[data-savelive]');if(!t)return;
    if(t.dataset.visit)markVisited(t.dataset.visit);
    if(t.dataset.deleteplace)deletePlace(t.dataset.deleteplace);
    if(t.dataset.showplace){const p=myPlaces.find(x=>x.id===t.dataset.showplace);if(p)showOnMap(wishlistMap,p.lat,p.lng);}
    if(t.dataset.showdiary){const d=diaries.find(x=>x.id===t.dataset.showdiary);if(d){showOnMap(visitedMap,d.lat,d.lng);openDiary(d);}}
    if(t.dataset.deletediary)deleteDiary(t.dataset.deletediary);
    if(t.dataset.savecatalog){const s=catalog.find(x=>x.id===t.dataset.savecatalog);if(s)saveCatalog(s);}
    if(t.dataset.savelive){const s=liveCatalog.find(x=>x.id===t.dataset.savelive);if(s)saveCatalog(s);}
    
  });
  $('addNoteBtn').onclick=()=>{if(requireLogin())$('noteDialog').showModal();};$('saveQuickNote').onclick=saveQuickNote;$('noteForm').addEventListener('submit',saveNote);
  $('addBucketBtn').onclick=()=>{if(requireLogin())$('bucketDialog').showModal();};$('bucketForm').addEventListener('submit',saveBucket);
  $('addEventBtn').onclick=()=>{if(requireLogin()){$('eventDate').value=selectedCalendarDate;$('eventDialog').showModal();}};$('eventForm').addEventListener('submit',saveEvent);
  $('prevMonth').onclick=()=>{calendarCursor.setMonth(calendarCursor.getMonth()-1);renderCalendar();};$('nextMonth').onclick=()=>{calendarCursor.setMonth(calendarCursor.getMonth()+1);renderCalendar();};
  document.querySelectorAll('[data-bucket-filter]').forEach(b=>b.onclick=()=>{bucketFilter=b.dataset.bucketFilter;document.querySelectorAll('[data-bucket-filter]').forEach(x=>x.classList.toggle('active',x===b));renderBuckets();});
  document.addEventListener('click',e=>{const t=e.target.closest('[data-selectdate],[data-deletenote],[data-deletebucket],[data-deleteevent]');if(!t)return;if(t.dataset.selectdate){selectedCalendarDate=t.dataset.selectdate;renderCalendar();}if(t.dataset.deletenote)deleteOwned('travel_notes',t.dataset.deletenote);if(t.dataset.deletebucket)deleteOwned('travel_buckets',t.dataset.deletebucket);if(t.dataset.deleteevent)deleteOwned('travel_events',t.dataset.deleteevent);});
  document.addEventListener('change',e=>{const t=e.target.closest('[data-togglebucket]');if(t)toggleBucket(t.dataset.togglebucket,t.checked);});
  initMaps();
  if(sb){authRefresh().then(loadPrivateData);sb.auth.onAuthStateChange(async()=>{await authRefresh();await loadPrivateData();});}
  else{toast('시작하려면 기존 config.js에 Supabase URL과 Publishable key가 설정되어 있어야 해요.');renderAll();}
})();
