(() => {
  const $ = id => document.getElementById(id);
  const cfg = window.APP_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_PUBLISHABLE_KEY && !String(cfg.SUPABASE_URL).includes('YOUR_') && !String(cfg.SUPABASE_PUBLISHABLE_KEY).includes('YOUR_');
  let sb = null;
  let supabaseInitError = '';
  if (configured && window.supabase) {
    try {
      sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);
    } catch (err) {
      supabaseInitError = err?.message || 'Supabase 설정을 읽지 못했어요.';
      console.error('Supabase 초기화 오류:', err);
    }
  }
  const DIARY_BUCKET = 'private-diary';
  let user = null, wishlistMap, visitedMap;
  let wishlistPoint = null, diaryPoint = null;
  let wishlistMarkers = [], visitedMarkers = [];
  let wishlistDraftMarker = null, diaryDraftMarker = null;
  let myPlaces = [], diaries = [], catalog = [], notes = [], buckets = [], events = [];
  let bucketFilter='all', calendarCursor=new Date(), selectedCalendarDate=new Date().toISOString().slice(0,10), calendarPickerMode='calendar';
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
  function validCoords(lat,lng){
    if(lat===null||lat===undefined||lng===null||lng===undefined) return false;
    if(String(lat).trim()===''||String(lng).trim()==='') return false;
    const a=Number(lat), b=Number(lng);
    return Number.isFinite(a)&&Number.isFinite(b)&&a>=-90&&a<=90&&b>=-180&&b<=180;
  }
  function routeUrl(lat,lng){
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${Number(lat)},${Number(lng)}`)}`;
  }
  function popupHtml(title,lat,lng){
    return `<strong>${escapeHtml(title||'장소')}</strong><br>${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}<br><a href="${routeUrl(lat,lng)}" target="_blank" rel="noopener noreferrer">길찾기 열기</a>`;
  }
  function marker(map,list,lat,lng,title,fn){
    if(!validCoords(lat,lng))return;
    const a=Number(lat), b=Number(lng);
    const m=L.marker([a,b]).addTo(map).bindPopup(popupHtml(title,a,b));
    if(fn)m.on('click',fn); list.push(m);
  }
  function initMaps(){
    wishlistMap=makeMap('wishlistMap');
    visitedMap=makeMap('visitedMap');

    wishlistMap.on('click',e=>{
      wishlistPoint={lat:e.latlng.lat,lng:e.latlng.lng};
      if(wishlistDraftMarker) wishlistMap.removeLayer(wishlistDraftMarker);

      wishlistDraftMarker=L.marker(e.latlng)
        .addTo(wishlistMap)
        .bindPopup(popupHtml('저장할 위치',wishlistPoint.lat,wishlistPoint.lng))
        .openPopup();

      $('placeCoords').textContent=
        `선택 위치: ${wishlistPoint.lat.toFixed(5)}, ${wishlistPoint.lng.toFixed(5)}`;

      if(user){
        $('placeDialog').showModal();
      } else {
        $('authDialog').showModal();
        $('authMessage').textContent='기록을 저장하려면 먼저 로그인해 주세요.';
      }
    });

    visitedMap.on('click',e=>{
      diaryPoint={lat:e.latlng.lat,lng:e.latlng.lng};
      if(diaryDraftMarker) visitedMap.removeLayer(diaryDraftMarker);

      diaryDraftMarker=L.marker(e.latlng)
        .addTo(visitedMap)
        .bindPopup(popupHtml('방문 위치',diaryPoint.lat,diaryPoint.lng))
        .openPopup();

      $('diaryCoords').textContent=
        `선택 위치: ${diaryPoint.lat.toFixed(5)}, ${diaryPoint.lng.toFixed(5)}`;
    });
  }
  function updateTabletMapHeight(){
    const tablet=window.matchMedia('(min-width:701px) and (max-width:1100px)').matches;
    ['wishlistMap','visitedMap'].forEach(id=>{
      const el=$(id);
      if(el) el.style.height=tablet?'min(62vh, 560px)':'';
    });
    if(tablet){
      document.documentElement.classList.add('tablet-layout');
    }else{
      document.documentElement.classList.remove('tablet-layout');
    }
    wishlistMap?.invalidateSize();
    visitedMap?.invalidateSize();
  }

  window.addEventListener('resize',updateTabletMapHeight);

  function switchTab(name){
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    $(`${name}View`).classList.add('active');
    setTimeout(()=>{if(name==='map'){wishlistMap?.invalidateSize();visitedMap?.invalidateSize();}},80);
  }
  async function authRefresh(){
    if(!sb){
      $('authStatus').textContent='설정 필요';
      $('authOpen').classList.remove('hidden');
      $('logoutBtn').classList.add('hidden');
      $('authStatus').style.display='inline-block';
      return;
    }

    const {data}=await sb.auth.getSession();
    user=data.session?.user||null;

    $('authStatus').textContent=
      user?(user.user_metadata?.username || '로그인됨'):'로그인 전';

    $('authStatus').style.display='inline-block';
    $('authStatus').style.maxWidth='100px';
    $('authStatus').style.overflow='hidden';
    $('authStatus').style.textOverflow='ellipsis';
    $('authStatus').style.whiteSpace='nowrap';

    $('authOpen').classList.toggle('hidden',!!user);
    $('logoutBtn').classList.toggle('hidden',!user);
  }
  function usernameToAuthEmail(username){
    // Supabase Auth requires an email identifier. This reserved .invalid address is
    // generated internally; the user never enters or receives an email address.
    return `psk_${username.toLowerCase()}@example.com`;
  }
  async function authAction(mode){
    if(!sb){
      $('authMessage').textContent = supabaseInitError
        ? 'Supabase 설정 오류: ' + supabaseInitError
        : 'config.js의 Supabase URL과 Publishable key를 확인해 주세요.';
      return;
    }
    const username=$('usernameInput').value.trim(),password=$('passwordInput').value;
    if(!/^[a-zA-Z0-9_-]{4,20}$/.test(username)){
      $('authMessage').textContent='아이디는 영문, 숫자, _ 또는 -만 사용해 4~20자로 입력해 주세요.';return;
    }
    if(password.length<8){$('authMessage').textContent='비밀번호는 8자 이상 입력해 주세요.';return;}
    $('authMessage').textContent='처리 중...';
    const email=usernameToAuthEmail(username);
    let result;
    try {
      result = mode==='signup'
        ? await sb.auth.signUp({email,password,options:{data:{username:username.toLowerCase()}}})
        : await sb.auth.signInWithPassword({email,password});
    } catch (err) {
      $('authMessage').textContent = '요청 중 오류가 발생했어요: ' + (err?.message || '네트워크 상태를 확인해 주세요.');
      console.error('인증 요청 오류:', err);
      return;
    }
    if(result.error){
      const msg=result.error.message||'인증에 실패했어요.';
      $('authMessage').textContent=mode==='signup'&&/already registered|already been registered/i.test(msg)
        ? '이미 사용 중인 아이디예요. 다른 아이디를 선택해 주세요.' : msg;
      return;
    }
    if(mode==='signup'&&!result.data.session){
      $('authMessage').textContent='Supabase에서 Confirm email을 OFF로 바꿔야 이메일 없이 가입할 수 있어요. 설정 후 다시 시도해 주세요.';return;
    }
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
    const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth();
    const title=$('calendarMonth');
    title.textContent=calendarPickerMode==='year'?`${Math.floor(y/10)*10}년대`:calendarPickerMode==='month'?`${y}년`:`${y}년 ${m+1}월`;
    title.setAttribute('aria-label',calendarPickerMode==='calendar'?'월 선택':'연도 선택');
    const grid=$('calendarGrid');
    if(calendarPickerMode==='month'){
      grid.innerHTML=Array.from({length:12},(_,i)=>`<button class="calendar-pick" data-calendar-month="${i}">${i+1}월</button>`).join('');
      renderSelectedEvents();return;
    }
    if(calendarPickerMode==='year'){
      const start=Math.floor(y/10)*10-1;
      grid.innerHTML=Array.from({length:12},(_,i)=>{const year=start+i;return `<button class="calendar-pick ${year===y?'selected':''}" data-calendar-year="${year}">${year}년</button>`;}).join('');
      renderSelectedEvents();return;
    }
    const first=new Date(y,m,1),start=first.getDay(),days=new Date(y,m+1,0).getDate();
    const labels=['일','월','화','수','목','금','토'];let html=labels.map(x=>`<div class="calendar-weekday">${x}</div>`).join('');
    for(let i=0;i<start;i++)html+='<div class="calendar-day empty-day"></div>';
    for(let d=1;d<=days;d++){const key=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,count=events.filter(e=>e.event_date===key).length;html+=`<button class="calendar-day ${selectedCalendarDate===key?'selected':''}" data-selectdate="${key}"><span>${d}</span>${count?`<i>${count}</i>`:''}</button>`;}
    grid.innerHTML=html;renderSelectedEvents();
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
    $('detailContent').innerHTML=`<p class="eyebrow">MY PLACE</p><h2>${escapeHtml(p.name)}</h2><p class="detail-text">${escapeHtml(p.note||'메모 없음')}</p><p>${tagsHtml(p.tags)}</p><div class="card-actions">${validCoords(p.lat,p.lng)?'<button id="detailRoute" class="button primary">길찾기</button>':''}</div>`;
    $('detailDialog').showModal();
    if(validCoords(p.lat,p.lng)) $('detailRoute').onclick=()=>window.open(routeUrl(p.lat,p.lng),'_blank','noopener');
  }
  function openDiary(d){
    $('detailContent').innerHTML=`<p class="eyebrow">TRAVEL DIARY · ${escapeHtml(d.visited_on)}</p><h2>${escapeHtml(d.place_name)}</h2>${d.photo_signed?`<img class="detail-photo" src="${escapeHtml(d.photo_signed)}" alt="방문 사진">`:''}<p class="detail-text">${escapeHtml(d.body||'')}</p><p>${tagsHtml(d.tags)}</p><div class="card-actions">${validCoords(d.lat,d.lng)?'<button id="detailRoute" class="button primary">길찾기</button>':''}</div>`;
    $('detailDialog').showModal();
    if(validCoords(d.lat,d.lng)) $('detailRoute').onclick=()=>window.open(routeUrl(d.lat,d.lng),'_blank','noopener');
  }
  function openCatalog(s){
    $('detailContent').innerHTML=`<p class="eyebrow">PHOTO SPOT · ${escapeHtml(s.region)}</p><h2>${escapeHtml(s.name)}</h2><p class="detail-text">${escapeHtml(s.description)}</p><p>${tagsHtml(s.tags)}</p><div class="card-actions"><button id="detailSave" class="button primary">가고 싶은 곳에 저장</button><button id="detailRoute" class="button secondary">길찾기</button></div>`;
    $('detailDialog').showModal();$('detailSave').onclick=()=>saveCatalog(s);$('detailRoute').onclick=()=>{if(validCoords(s.lat,s.lng))window.open(routeUrl(s.lat,s.lng),'_blank','noopener');else toast('이 장소에는 지도 좌표가 없어요.');};
  }
  async function saveCatalog(s){
    if(!requireLogin())return;
    const {error}=await sb.from('my_places').insert({user_id:user.id,name:String(s.name||'').slice(0,100),region:s.region,category:s.category,note:[s.description,s.url?`출처: ${s.url}`:''].filter(Boolean).join('\n\n'),status:'wishlist',lat:s.lat??null,lng:s.lng??null,tags:s.tags||[]});
    if(error){toast('저장 실패: '+error.message);return;} $('detailDialog').close();await loadPrivateData();toast('가고 싶은 곳에 저장했어요.');
  }
  async function saveWishlist(e){
    e.preventDefault();
    if(!requireLogin())return;
    const name=$('placeName').value.trim();
    if(!name)return;

    const row={
      user_id:user.id,
      name,
      region:$('placeRegion').value.trim(),
      category:$('placeCategory').value,
      note:$('placeNote').value.trim(),
      tags:tagsFrom($('placeTags').value),
      status:'wishlist',
      lat:wishlistPoint?.lat??null,
      lng:wishlistPoint?.lng??null
    };

    const {error}=await sb.from('my_places').insert(row);
    if(error){toast('저장 실패: '+error.message);return;}

    $('placeForm').reset();
    wishlistPoint=null;
    if(wishlistDraftMarker){
      wishlistMap.removeLayer(wishlistDraftMarker);
      wishlistDraftMarker=null;
    }
    $('placeCoords').textContent='지도를 눌러 위치를 선택해 주세요.';
    $('placeDialog').close();
    await loadPrivateData();
    toast('장소를 저장했어요.');
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
      $('diaryForm').reset();
      diaryPoint=null;
      if(diaryDraftMarker){
        visitedMap.removeLayer(diaryDraftMarker);
        diaryDraftMarker=null;
      }
      $('diaryCoords').textContent='선택한 위치: 없음 (방문 장소는 지도에서 선택할 수 있어요.)';
      $('diaryDialog').close();
      await loadPrivateData();
      toast('방문 일기를 저장했어요.');
    }catch(err){if(photoPath)await sb.storage.from(DIARY_BUCKET).remove([photoPath]);toast('일기 저장 실패: '+err.message);}
  }
  async function deleteDiary(id){if(!confirm('이 일기를 삭제할까요?'))return;const d=diaries.find(x=>x.id===id);const {error}=await sb.from('diary_entries').delete().eq('id',id).eq('user_id',user.id);if(error){toast(error.message);return;}if(d?.photo_path)await sb.storage.from(DIARY_BUCKET).remove([d.photo_path]);await loadPrivateData();}
  let wishlistFocusMarker=null, visitedFocusMarker=null;
  function showOnMap(map,lat,lng,title,list){
    if(!validCoords(lat,lng)){toast('이 장소에는 유효한 지도 좌표가 없어요.');return;}
    switchTab('map');
    const a=Number(lat), b=Number(lng);
    setTimeout(()=>{
      map.invalidateSize();
      map.flyTo([a,b],16,{duration:0.45});
      const existing=(list||[]).find(m=>{
        const p=m.getLatLng();
        return Math.abs(p.lat-a)<0.000001&&Math.abs(p.lng-b)<0.000001;
      });
      if(existing){existing.openPopup();return;}
      const isWishlist=map===wishlistMap;
      const old=isWishlist?wishlistFocusMarker:visitedFocusMarker;
      if(old)map.removeLayer(old);
      const selected=L.marker([a,b]).addTo(map).bindPopup(popupHtml(title||'선택한 장소',a,b)).openPopup();
      if(isWishlist)wishlistFocusMarker=selected;else visitedFocusMarker=selected;
    },120);
  }
  document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));

  // 설정 버튼과 전체 데이터 초기화 화면을 앱 스크립트에서 생성합니다.
  (function addSettingsUI(){
    const anchor = $('authOpen');
    if(!anchor || $('settingsOpen')) return;

    const style = document.createElement('style');
    style.textContent = `
      #settingsOpen{border:1px solid var(--line,#ddd);background:var(--surface,#fff);color:inherit;border-radius:999px;padding:9px 13px;font:inherit;cursor:pointer;margin-left:6px}
      #settingsDialog{width:min(92vw,480px);border:0;border-radius:18px;padding:22px;background:var(--surface,#fff);color:var(--text,#222);box-shadow:0 18px 60px #0003}
      #settingsDialog::backdrop{background:#0008}
      #settingsDialog h2{margin:0 0 12px;font-size:1.25rem}
      #settingsDialog p{line-height:1.6}
      #settingsDialog .settings-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:20px}
      #settingsDialog button{border:0;border-radius:10px;padding:10px 14px;font:inherit;cursor:pointer}
      #settingsDialog .settings-close{background:#eee;color:#222}
      #settingsDialog .settings-danger{background:#c62828;color:white}
      #settingsResetStatus{min-height:1.4em;color:#b3261e;font-size:.9rem}
    `;
    document.head.appendChild(style);

    const button = document.createElement('button');
    button.id = 'settingsOpen';
    button.type = 'button';
    button.textContent = '⚙ 설정';
    button.setAttribute('aria-label','앱 설정 열기');
    anchor.insertAdjacentElement('afterend', button);

    const dialog = document.createElement('dialog');
    dialog.id = 'settingsDialog';
    dialog.innerHTML = `
      <h2>앱 설정</h2>
      <p>현재 설정할 수 있는 항목은 계정 데이터 전체 초기화입니다.</p>
      <p><strong>초기화되는 데이터</strong><br>가고 싶은 곳, 다녀온 곳, 방문 일기와 사진, 메모, 버킷리스트, 일정</p>
      <p><strong>계정과 로그인 정보는 삭제되지 않습니다.</strong> 초기화 후에도 같은 아이디로 로그인할 수 있지만, 삭제된 기록은 복구할 수 없습니다.</p>
      <div id="settingsResetStatus" role="status"></div>
      <div class="settings-actions">
        <button type="button" class="settings-close" id="settingsClose">닫기</button>
        <button type="button" class="settings-danger" id="settingsResetAll">전체 데이터 초기화</button>
      </div>`;
    document.body.appendChild(dialog);

    button.addEventListener('click',()=>{
      if(!user){ $('authDialog').showModal(); $('authMessage').textContent='설정을 이용하려면 먼저 로그인해 주세요.'; return; }
      $('settingsResetStatus').textContent='';
      dialog.showModal();
    });
    $('settingsClose').addEventListener('click',()=>dialog.close());
    $('settingsResetAll').addEventListener('click',resetAllAccountData);
  })();

  async function resetAllAccountData(){
    if(!sb || !user){ toast('먼저 로그인해 주세요.'); return; }
    const first = window.confirm('정말로 계정에 저장된 모든 장소, 일기, 사진, 메모, 버킷리스트와 일정을 삭제할까요? 이 작업은 되돌릴 수 없습니다.');
    if(!first) return;
    const second = window.prompt('정말 삭제하려면 "전체 삭제"라고 입력해 주세요.');
    if(second !== '전체 삭제'){ toast('초기화를 취소했어요.'); return; }

    const resetButton = $('settingsResetAll');
    const status = $('settingsResetStatus');
    resetButton.disabled = true;
    resetButton.textContent = '초기화 중...';
    status.textContent = '저장된 사진과 기록을 삭제하고 있어요. 창을 닫지 말아 주세요.';

    try {
      // 먼저 현재 계정의 일기 사진을 제거합니다.
      const photoPaths = diaries.map(d=>d.photo_path).filter(Boolean);
      if(photoPaths.length){
        const {error:storageError} = await sb.storage.from(DIARY_BUCKET).remove(photoPaths);
        if(storageError) throw new Error('일기 사진 삭제 실패: '+storageError.message);
      }

      // RLS와 user_id 조건을 이용해 현재 로그인 계정의 데이터만 삭제합니다.
      const tables = ['diary_entries','my_places','travel_notes','travel_buckets','travel_events'];
      for(const table of tables){
        const {error} = await sb.from(table).delete().eq('user_id',user.id);
        if(error) throw new Error(table+' 삭제 실패: '+error.message);
      }

      myPlaces=[]; diaries=[]; notes=[]; buckets=[]; events=[]; catalog=[];
      wishlistPoint=null; diaryPoint=null;
      if(wishlistDraftMarker){ wishlistMap?.removeLayer(wishlistDraftMarker); wishlistDraftMarker=null; }
      if(diaryDraftMarker){ visitedMap?.removeLayer(diaryDraftMarker); diaryDraftMarker=null; }
      renderAll();
      renderNotes();
      renderBuckets();
      renderCalendar();
      dialogCloseIfOpen('placeDialog');
      dialogCloseIfOpen('diaryDialog');
      status.textContent='초기화가 완료됐어요.';
      toast('계정에 저장된 데이터 전체를 초기화했어요. 로그인은 유지됩니다.');
      $('settingsDialog').close();
    } catch(err) {
      console.error('전체 초기화 오류:',err);
      status.textContent='초기화 중 오류가 발생했어요: '+(err?.message||'알 수 없는 오류');
      toast('일부 데이터가 남아 있을 수 있어요. 오류 내용을 확인해 주세요.');
    } finally {
      resetButton.disabled = false;
      resetButton.textContent = '전체 데이터 초기화';
    }
  }
  function dialogCloseIfOpen(id){
    const el=$(id);
    if(el?.open) el.close();
  }

  $('authOpen').onclick=()=>$('authDialog').showModal();$('signInBtn').onclick=()=>authAction('signin');$('signUpBtn').onclick=()=>authAction('signup');
  $('logoutBtn').onclick=async()=>{if(sb){await sb.auth.signOut();await authRefresh();await loadPrivateData();toast('로그아웃했어요.');}};
  $('addWishlistBtn').onclick=()=>{if(requireLogin()){$('placeCoords').textContent='지도에서 위치를 선택하거나 비워 둘 수 있어요.';$('placeDialog').showModal();}};
  $('addDiaryBtn').onclick=()=>{if(requireLogin()){$('diaryDate').value=new Date().toISOString().slice(0,10);$('diaryDialog').showModal();}};
  $('placeForm').addEventListener('submit',saveWishlist);$('diaryForm').addEventListener('submit',saveDiary);
  // 취소, ESC, 닫기 버튼으로 대화상자를 닫아도 저장 전 임시 마커를 제거합니다.
  $('placeDialog').addEventListener('close',()=>{
    if(wishlistDraftMarker){
      wishlistMap?.removeLayer(wishlistDraftMarker);
      wishlistDraftMarker=null;
    }
    wishlistPoint=null;
    $('placeCoords').textContent='지도를 눌러 위치를 선택해 주세요.';
  });
  $('diaryDialog').addEventListener('close',()=>{
    if(diaryDraftMarker){
      visitedMap?.removeLayer(diaryDraftMarker);
      diaryDraftMarker=null;
    }
    diaryPoint=null;
    $('diaryCoords').textContent='선택한 위치: 없음 (방문 장소는 지도에서 선택할 수 있어요.)';
  });
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-visit],[data-deleteplace],[data-showplace],[data-showdiary],[data-deletediary],[data-savecatalog],[data-savelive]');if(!t)return;
    if(t.dataset.visit)markVisited(t.dataset.visit);
    if(t.dataset.deleteplace)deletePlace(t.dataset.deleteplace);
    if(t.dataset.showplace){const p=myPlaces.find(x=>x.id===t.dataset.showplace);if(p)showOnMap(wishlistMap,p.lat,p.lng,p.name,wishlistMarkers);}
    if(t.dataset.showdiary){const d=diaries.find(x=>x.id===t.dataset.showdiary);if(d){showOnMap(visitedMap,d.lat,d.lng,d.place_name,visitedMarkers);openDiary(d);}}
    if(t.dataset.deletediary)deleteDiary(t.dataset.deletediary);
    if(t.dataset.savecatalog){const s=catalog.find(x=>x.id===t.dataset.savecatalog);if(s)saveCatalog(s);}
    if(t.dataset.savelive){const s=liveCatalog.find(x=>x.id===t.dataset.savelive);if(s)saveCatalog(s);}
  });
  $('addNoteBtn').onclick=()=>{if(requireLogin())$('noteDialog').showModal();};$('saveQuickNote').onclick=saveQuickNote;$('noteForm').addEventListener('submit',saveNote);
  $('addBucketBtn').onclick=()=>{if(requireLogin())$('bucketDialog').showModal();};$('bucketForm').addEventListener('submit',saveBucket);
  $('addEventBtn').onclick=()=>{if(requireLogin()){$('eventDate').value=selectedCalendarDate;$('eventDialog').showModal();}};$('eventForm').addEventListener('submit',saveEvent);
  $('calendarMonth').onclick=()=>{calendarPickerMode=calendarPickerMode==='calendar'?'month':calendarPickerMode==='month'?'year':'month';renderCalendar();};
  $('prevMonth').onclick=()=>{if(calendarPickerMode==='year')calendarCursor.setFullYear(calendarCursor.getFullYear()-10);else if(calendarPickerMode==='month')calendarCursor.setFullYear(calendarCursor.getFullYear()-1);else calendarCursor.setMonth(calendarCursor.getMonth()-1);renderCalendar();};
  $('nextMonth').onclick=()=>{if(calendarPickerMode==='year')calendarCursor.setFullYear(calendarCursor.getFullYear()+10);else if(calendarPickerMode==='month')calendarCursor.setFullYear(calendarCursor.getFullYear()+1);else calendarCursor.setMonth(calendarCursor.getMonth()+1);renderCalendar();};
  document.querySelectorAll('[data-bucket-filter]').forEach(b=>b.onclick=()=>{bucketFilter=b.dataset.bucketFilter;document.querySelectorAll('[data-bucket-filter]').forEach(x=>x.classList.toggle('active',x===b));renderBuckets();});
  document.addEventListener('click',e=>{const t=e.target.closest('[data-selectdate],[data-calendar-month],[data-calendar-year],[data-deletenote],[data-deletebucket],[data-deleteevent]');if(!t)return;if(t.dataset.selectdate){selectedCalendarDate=t.dataset.selectdate;renderCalendar();}if(t.dataset.calendarMonth!==undefined){calendarCursor.setMonth(Number(t.dataset.calendarMonth));calendarPickerMode='calendar';renderCalendar();}if(t.dataset.calendarYear){calendarCursor.setFullYear(Number(t.dataset.calendarYear));calendarPickerMode='month';renderCalendar();}if(t.dataset.deletenote)deleteOwned('travel_notes',t.dataset.deletenote);if(t.dataset.deletebucket)deleteOwned('travel_buckets',t.dataset.deletebucket);if(t.dataset.deleteevent)deleteOwned('travel_events',t.dataset.deleteevent);});
  document.addEventListener('change',e=>{const t=e.target.closest('[data-togglebucket]');if(t)toggleBucket(t.dataset.togglebucket,t.checked);});
  // 모바일 키보드가 입력창을 가리지 않도록 대화상자와 입력 위치를 조정합니다.
  function keepInputVisible(target){
    if(!target || !target.matches('input, textarea, select, [contenteditable="true"]')) return;
    const updatePosition=()=>{
      const vv=window.visualViewport;
      const dialog=target.closest('dialog');
      if(dialog && vv){
        dialog.style.position='fixed';
        dialog.style.top=Math.max(8,vv.offsetTop+8)+'px';
        dialog.style.left='50%';
        dialog.style.transform='translateX(-50%)';
        dialog.style.margin='0';
        dialog.style.maxHeight=Math.max(180,vv.height-16)+'px';
        dialog.style.overflowY='auto';
        dialog.style.webkitOverflowScrolling='touch';
        dialog.style.boxSizing='border-box';
        dialog.style.width='min(94vw, 620px)';
      }
      target.scrollIntoView({behavior:'auto',block:'center',inline:'nearest'});
      if(dialog){
        const r=target.getBoundingClientRect(), d=dialog.getBoundingClientRect();
        if(r.bottom>d.bottom-18 || r.top<d.top+18){
          dialog.scrollTop += (r.bottom>d.bottom-18 ? r.bottom-d.bottom+28 : r.top-d.top-28);
        }
      }
    };
    requestAnimationFrame(updatePosition);
    setTimeout(updatePosition,180);
    setTimeout(updatePosition,420);
  }
  document.addEventListener('focusin',e=>keepInputVisible(e.target));
  document.addEventListener('focusout',e=>{
    const dialog=e.target.closest('dialog');
    if(dialog && !dialog.querySelector(':focus')){
      setTimeout(()=>{
        dialog.style.position='';
        dialog.style.top='';
        dialog.style.left='';
        dialog.style.transform='';
        dialog.style.margin='';
        dialog.style.maxHeight='';
        dialog.style.overflowY='';
        dialog.style.width='';
      },180);
    }
  });
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',()=>keepInputVisible(document.activeElement));
    window.visualViewport.addEventListener('scroll',()=>keepInputVisible(document.activeElement));
  }
  const responsiveStyle=document.createElement('style');
  responsiveStyle.textContent=`
    @media (min-width:701px) and (max-width:1100px){
      body{font-size:17px}
      .view{padding:clamp(18px,3vw,32px)}
      #wishlistMap,#visitedMap{min-height:420px}
      .calendar-day{min-height:78px;font-size:18px}
      .calendar-weekday{font-size:15px;padding:10px 2px}
      .calendar-day span{font-size:19px}
      .calendar-pick{min-height:68px;font-size:17px}
      .place-card,.diary-card,.note-card,.bucket-card{padding:18px}
      button,.button,input,textarea,select{font-size:16px}
    }
    @media (max-width:700px){
      dialog{max-width:94vw}
      dialog form{max-height:calc(100dvh - 24px);overflow-y:auto}
    }
  `;
  document.head.appendChild(responsiveStyle);

  initMaps();
  updateTabletMapHeight();
  if(sb){authRefresh().then(loadPrivateData);sb.auth.onAuthStateChange(async()=>{await authRefresh();await loadPrivateData();});}
  else{toast('시작하려면 기존 config.js에 Supabase URL과 Publishable key가 설정되어 있어야 해요.');renderAll();}
})();
