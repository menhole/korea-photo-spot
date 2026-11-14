(() => {
  const $ = (id) => document.getElementById(id);
  const cfg = window.APP_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_PUBLISHABLE_KEY &&
    !cfg.SUPABASE_URL.includes("YOUR_PROJECT") && !cfg.SUPABASE_PUBLISHABLE_KEY.includes("REPLACE_ME");
  const supabase = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY) : null;
  const BUCKET = "spot-photos";
  const categoryNames = {nature:"자연", viewpoint:"전망", sea:"바다", city:"도시·건축", community:"사용자 등록"};
  const icons = {nature:"🌿",viewpoint:"🌄",sea:"🌊",city:"🏙️",community:"📷"};
  let map, selectedPoint = null, markers = [], allSpots = [], osmSpots = [], activeCategory = "all";
  let currentUser = null;
  let favorites = JSON.parse(localStorage.getItem("psk_favorites") || "[]");

  function toast(message) {
    $("toast").textContent = message; $("toast").classList.add("show");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => $("toast").classList.remove("show"), 2600);
  }
  function escapeHtml(s="") { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function initMap() {
    map = L.map("map").setView([36.35, 127.8], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    map.on("click", e => {
      selectedPoint = {lat:e.latlng.lat, lng:e.latlng.lng};
      $("selectedCoords").textContent = `선택한 위치: ${selectedPoint.lat.toFixed(5)}, ${selectedPoint.lng.toFixed(5)}`;
      if (window.selectionMarker) map.removeLayer(window.selectionMarker);
      window.selectionMarker = L.marker([selectedPoint.lat, selectedPoint.lng]).addTo(map).bindPopup("새 장소 위치").openPopup();
    });
  }
  function getCategory(tags={}) {
    if (tags.natural || tags.leisure === "park" || tags.tourism === "viewpoint") return tags.tourism === "viewpoint" ? "viewpoint" : "nature";
    if (tags.natural === "beach" || tags.place === "beach" || tags.waterway || tags.natural === "coastline") return "sea";
    if (tags.building || tags.tourism === "museum" || tags.historic) return "city";
    return "viewpoint";
  }
  function render() {
    markers.forEach(m => map.removeLayer(m)); markers = [];
    const community = allSpots.map(s => ({...s, category:s.category || "community", source:"community"}));
    const combined = [...community, ...osmSpots];
    const visible = combined.filter(s => {
      if (activeCategory === "all") return true;
      if (activeCategory === "favorite") return favorites.includes(String(s.id));
      if (activeCategory === "community") return s.source === "community";
      return s.category === activeCategory;
    }).filter(s => !($("searchInput").value.trim()) || (s.name || "").toLowerCase().includes($("searchInput").value.trim().toLowerCase()));
    visible.forEach(s => {
      const lat = Number(s.lat), lng = Number(s.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const marker = L.marker([lat,lng]).addTo(map);
      marker.bindPopup(`<b>${escapeHtml(s.name)}</b><br>${escapeHtml(categoryNames[s.category] || "지도 데이터")}`);
      marker.on("click", () => openDetail(s));
      markers.push(marker);
    });
    $("resultCount").textContent = `${visible.length}곳`;
    $("spotList").innerHTML = visible.slice(0,100).map(s => {
      const photo = s.photo_url || "";
      const isFav = favorites.includes(String(s.id));
      return `<article class="spot-card" data-id="${escapeHtml(s.id)}" data-source="${s.source || "osm"}">
        ${photo ? `<img class="spot-thumb" src="${escapeHtml(photo)}" alt="" loading="lazy">` : `<div class="spot-thumb placeholder">${icons[s.category] || "📍"}</div>`}
        <div class="spot-info"><span class="tag">${escapeHtml(categoryNames[s.category] || "지도 장소")}</span><b>${escapeHtml(s.name)}</b><p>${escapeHtml(s.description || s.address || "지도에서 위치를 확인해 보세요.")}</p></div>
        <button class="favorite-btn" aria-label="즐겨찾기">${isFav ? "★" : "☆"}</button></article>`;
    }).join("") || `<div class="empty">표시할 장소가 없어요. 다른 지역을 검색하거나 장소를 등록해 보세요.</div>`;
    document.querySelectorAll(".spot-card").forEach(card => {
      card.addEventListener("click", e => {
        const s = visible.find(x => String(x.id) === card.dataset.id && (x.source || "osm") === card.dataset.source);
        if (e.target.closest(".favorite-btn")) { e.stopPropagation(); toggleFavorite(s); return; }
        if (s) { map.setView([s.lat,s.lng], 15); openDetail(s); }
      });
    });
  }
  function toggleFavorite(s) {
    const id = String(s.id);
    favorites = favorites.includes(id) ? favorites.filter(x => x !== id) : [...favorites,id];
    localStorage.setItem("psk_favorites", JSON.stringify(favorites)); render();
  }
  function openDetail(s) {
    const photo = s.photo_url ? `<img class="detail-photo" src="${escapeHtml(s.photo_url)}" alt="장소 사진">` : "";
    const category = categoryNames[s.category] || "지도 장소";
    const route = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.lat+","+s.lng)}`;
    $("detailContent").innerHTML = `<p class="eyebrow">${escapeHtml(category)}</p><h2>${escapeHtml(s.name)}</h2>${photo}<p class="detail-text">${escapeHtml(s.description || s.address || "등록된 설명이 없습니다.")}</p><div class="detail-actions"><button id="detailFav" class="button secondary">${favorites.includes(String(s.id)) ? "즐겨찾기 해제" : "즐겨찾기"}</button><button id="detailRoute" class="button primary">길찾기</button></div>`;
    $("detailDialog").showModal();
    $("detailFav").onclick = () => { toggleFavorite(s); $("detailDialog").close(); };
    $("detailRoute").onclick = () => window.open(route, "_blank", "noopener,noreferrer");
  }
  async function refreshSpots() {
    if (!supabase) { allSpots = []; render(); return; }
    const {data,error} = await supabase.from("spots").select("*").order("created_at",{ascending:false}).limit(500);
    if (error) { toast("장소 목록을 불러오지 못했어요: " + error.message); return; }
    allSpots = data || []; render();
  }
  async function updateAuth() {
    if (!supabase) {
      $("authStatus").textContent = "Supabase 설정 필요";
      $("authOpen").classList.remove("hidden"); $("logoutBtn").classList.add("hidden"); return;
    }
    const {data} = await supabase.auth.getSession();
    currentUser = data.session?.user || null;
    $("authStatus").textContent = currentUser ? (currentUser.email || "로그인됨") : "로그인 전";
    $("authOpen").classList.toggle("hidden", !!currentUser);
    $("logoutBtn").classList.toggle("hidden", !currentUser);
  }
  async function authAction(action) {
    if (!supabase) { $("authMessage").textContent = "먼저 config.js에 Supabase 프로젝트 주소와 Publishable key를 입력하세요."; return; }
    const email = $("emailInput").value.trim(), password = $("passwordInput").value;
    if (!email || password.length < 6) { $("authMessage").textContent = "이메일과 6자 이상의 비밀번호를 입력하세요."; return; }
    $("authMessage").textContent = "처리 중...";
    const result = action === "signup"
      ? await supabase.auth.signUp({email,password})
      : await supabase.auth.signInWithPassword({email,password});
    if (result.error) { $("authMessage").textContent = result.error.message; return; }
    $("authMessage").textContent = action === "signup" ? "가입 요청이 완료됐어요. 이메일 확인이 필요할 수 있어요." : "로그인했어요.";
    await updateAuth(); await refreshSpots();
    if (action === "signin" && currentUser) $("authDialog").close();
  }
  async function uploadPhoto(file) {
    if (!file) return null;
    if (!file.type.startsWith("image/") || !["image/jpeg","image/png","image/webp"].includes(file.type)) throw new Error("JPG, PNG, WEBP 사진만 올릴 수 있어요.");
    if (file.size > 5 * 1024 * 1024) throw new Error("사진은 5MB 이하로 선택해 주세요.");
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${currentUser.id}/${crypto.randomUUID()}.${ext}`;
    const {error} = await supabase.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false});
    if (error) throw error;
    const {data} = supabase.storage.from(BUCKET).getPublicUrl(path);
    return {path,url:data.publicUrl};
  }
  async function submitSpot(e) {
    e.preventDefault();
    if (!supabase) { toast("Supabase 설정을 먼저 완료해 주세요."); return; }
    if (!currentUser) { toast("장소 등록은 로그인 후 사용할 수 있어요."); $("authDialog").showModal(); return; }
    if (!selectedPoint) { toast("먼저 지도를 눌러 장소 위치를 선택하세요."); return; }
    const name = $("spotName").value.trim();
    if (!name) return;
    const submit = e.submitter; if (submit) submit.disabled = true;
    try {
      let photo = null;
      const file = $("spotPhoto").files[0];
      if (file) photo = await uploadPhoto(file);
      const row = {
        user_id: currentUser.id, name, category:$("spotCategory").value,
        description:$("spotDescription").value.trim(),
        lat:selectedPoint.lat, lng:selectedPoint.lng,
        photo_url:photo?.url || null, photo_path:photo?.path || null
      };
      const {error} = await supabase.from("spots").insert(row);
      if (error) {
        if (photo?.path) await supabase.storage.from(BUCKET).remove([photo.path]);
        throw error;
      }
      $("spotForm").reset(); selectedPoint = null;
      $("selectedCoords").textContent = "선택한 위치: 아직 없음";
      if (window.selectionMarker) { map.removeLayer(window.selectionMarker); window.selectionMarker = null; }
      await refreshSpots(); toast("장소가 모두와 공유됐어요!");
    } catch (err) { toast("등록 실패: " + (err.message || "다시 시도해 주세요.")); }
    finally { if (submit) submit.disabled = false; }
  }
  async function searchOSM() {
    const b = map.getBounds(), south=b.getSouth(), west=b.getWest(), north=b.getNorth(), east=b.getEast();
    const query = `[out:json][timeout:20];(node["tourism"~"attraction|viewpoint|museum|artwork"](${south},${west},${north},${east});way["tourism"~"attraction|viewpoint|museum"](${south},${west},${north},${east});node["natural"~"beach|peak|water"](${south},${west},${north},${east});node["historic"](${south},${west},${north},${east}););out center tags 80;`;
    $("osmBtn").disabled = true; $("osmBtn").textContent = "찾는 중...";
    try {
      const res = await fetch("https://overpass-api.de/api/interpreter", {method:"POST",body:"data="+encodeURIComponent(query)});
      if (!res.ok) throw new Error("지도 데이터 서버 응답이 원활하지 않아요.");
      const json = await res.json();
      osmSpots = (json.elements || []).map(el => {
        const tags = el.tags || {}, lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
        return {id:"osm-"+el.type+"-"+el.id, name:tags.name || tags["name:ko"] || "이름 없는 장소", category:getCategory(tags), lat,lng, description:tags.description || tags.tourism || tags.natural || tags.historic || "", address:tags["addr:full"] || "OpenStreetMap 장소", source:"osm"};
      }).filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));
      render(); toast(`${osmSpots.length}곳을 찾았어요. 데이터는 이용자 기여 정보예요.`);
    } catch (err) { toast(err.message || "장소 검색에 실패했어요."); }
    finally { $("osmBtn").disabled = false; $("osmBtn").textContent = "이 지역 장소 찾기"; }
  }

  $("authOpen").onclick = () => { $("authMessage").textContent = ""; $("authDialog").showModal(); };
  $("signInBtn").onclick = () => authAction("signin");
  $("signUpBtn").onclick = () => authAction("signup");
  $("logoutBtn").onclick = async () => { if (supabase) { await supabase.auth.signOut(); await updateAuth(); toast("로그아웃했어요."); } };
  $("spotForm").addEventListener("submit", submitSpot);
  $("osmBtn").onclick = searchOSM;
  $("searchBtn").onclick = render;
  $("searchInput").addEventListener("keydown",e=>{if(e.key==="Enter")render();});
  $("nearMeBtn").onclick = () => {
    if (!navigator.geolocation) return toast("이 브라우저에서는 위치 기능을 사용할 수 없어요.");
    navigator.geolocation.getCurrentPosition(pos => map.setView([pos.coords.latitude,pos.coords.longitude],14), () => toast("위치 권한을 확인해 주세요."));
  };
  document.querySelectorAll(".filter").forEach(btn => btn.onclick = () => {
    document.querySelectorAll(".filter").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active"); activeCategory = btn.dataset.category; render();
  });
  initMap();
  updateAuth().then(refreshSpots);
  if (supabase) supabase.auth.onAuthStateChange(() => { updateAuth(); refreshSpots(); });
  if (!supabase) toast("시작하려면 README의 Supabase 설정을 따라 config.js를 수정하세요.");
})();
