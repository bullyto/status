const $ = (id) => document.getElementById(id);

function getVal(id, fallback = ""){
  const el = $(id);
  const v = el ? (el.value ?? "") : "";
  const t = String(v).trim();
  return t || fallback;
}

function setVal(id, value){
  const el = $(id);
  if(el) el.value = value;
}

function nowIsoParisish(){
  const d = new Date();
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(tz)/60)).padStart(2,"0");
  const mm = String(Math.abs(tz)%60).padStart(2,"0");
  return d.toISOString().replace("Z", `${sign}${hh}:${mm}`);
}

function toast(msg){
  const t = $("toast");
  if(!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window.__toast);
  window.__toast = setTimeout(()=> t.classList.remove("show"), 2400);
}

async function loadStatus(){
  const r = await fetch("./status.json", { cache: "no-store" });
  return await r.json();
}

function readTokenUnified(){
  const fromInput = getVal("ghToken","").trim();
  if(fromInput) return fromInput;

  const legacy = (localStorage.getItem("gh_token") || "").trim();
  if(legacy) return legacy;

  try{
    const raw = localStorage.getItem("gh_token_v1");
    if(!raw) return "";
    const obj = JSON.parse(raw);
    if(!obj || typeof obj.token !== "string" || typeof obj.exp !== "number") return "";
    if(Date.now() > obj.exp) return "";
    return obj.token.trim();
  }catch(e){
    return "";
  }
}

function getCheckedDays(){
  const box = $("schedDays");
  if(!box) return [1,2,3,4,5,6,0];
  const checks = Array.from(box.querySelectorAll("input[type=checkbox]"));
  const days = checks.filter(c => c.checked).map(c => parseInt(c.value,10)).filter(n => Number.isFinite(n));
  return days.length ? days : [1,2,3,4,5,6,0];
}

function setCheckedDays(days){
  const box = $("schedDays");
  if(!box) return;
  const set = new Set((days||[]).map(n => String(n)));
  Array.from(box.querySelectorAll("input[type=checkbox]")).forEach(c => c.checked = set.has(String(c.value)));
}

/** --------- helpers affichage --------- */
function safeText(elId, txt, fallback="—"){
  const el = $(elId);
  if(!el) return;
  const t = (txt === null || txt === undefined) ? "" : String(txt);
  el.textContent = t.trim() ? t : fallback;
}

function safeImg(elId, src, fallback="images/panne.png"){
  const el = $(elId);
  if(!el) return;
  const s = (src === null || src === undefined) ? "" : String(src).trim();
  el.src = s || fallback;
}

function pickFirst(obj, keys){
  for(const k of keys){
    if(obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function getLiveCfg(data){
  const active = !!data.active;
  const mode = data.mode || "none";
  if(!active || !mode || mode === "none") return null;

  if(data.modes && data.modes[mode]) return data.modes[mode];
  if(data.presets && data.presets[mode]) return data.presets[mode];
  if(data.modes && data.modes[mode]) return data.modes[mode];

  return null;
}

function normalizeStatus(raw){
  const data = (window.structuredClone ? structuredClone(raw) : JSON.parse(JSON.stringify(raw)));
  if(!data.modes) data.modes = {};
  if(!data.presets) data.presets = {};

  Object.keys(data.modes).forEach(k => {
    if(k !== "info" && k !== "warning"){
      if(!data.presets[k]) data.presets[k] = data.modes[k];
    }
  });

  if(!data.modes.info){
    data.modes.info = { title:"Information", message:"", image:"images/panne.png", severity:"info", ok_delay_seconds:5 };
  }
  if(!data.modes.warning){
    data.modes.warning = {
      title:"Service momentanément indisponible",
      message:"Impossible de commander pour le moment.",
      image:"images/panne.png",
      severity:"warning",
      block_order:true,
      warning_click_message:"Ce n'est actuellement pas possible de commander.",
      block_schedule:{ enabled:false, days:[1,2,3,4,5,6,0], start:"19:00", end:"06:00" }
    };
  }

  const ensurePreset = (key, title, message, image) => {
    if(!data.presets[key]){
      data.presets[key] = { title, message, image, severity:"info" };
    }
  };
  ensurePreset("incident","Incident","Incident en cours. Merci de ta compréhension.","images/incident.png");
  ensurePreset("météo","Météo","Conditions météo compliquées. Service possiblement ralenti.","images/météo.png");
  ensurePreset("panne","Panne","Panne technique en cours. Service impacté.","images/panne.png");
  ensurePreset("sécurité","Sécurité","Mesure de sécurité en cours. Service temporairement indisponible.","images/sécurité.png");
  if(!data.presets.libre) data.presets.libre = { title:"", message:"", image:"images/panne.png", severity:"info" };

  return data;
}

function fillPresetSelect(data){
  const sel = $("preset");
  if(!sel) return;
  const presets = data.presets || {};
  const keys = Object.keys(presets);

  const order = ["météo","incident","panne","sécurité","libre"];
  const sorted = Array.from(new Set([...order, ...keys]));

  sel.innerHTML = sorted
    .filter(k => presets[k])
    .map(k => `<option value="${k}">${k === "libre" ? "message libre" : k}</option>`)
    .join("");
}

function syncModePanels(){
  const mode = getVal("mode","none");
  const infoBox = $("infoBox");
  const warningBox = $("warningBox");
  if(infoBox) infoBox.classList.toggle("ui-hide", mode !== "info");
  if(warningBox) warningBox.classList.toggle("ui-hide", mode !== "warning");
}

/** ✅ Publié en ligne : complet + ne met plus "—" inutilement */
function renderLivePreview(data){
  const active = !!data.active;
  const mode = data.mode || "none";

  safeText("liveActive", active ? "ACTIF" : "INACTIF");
  safeText("liveMode", mode);
  safeText("liveUpdated", data.last_update || "");

  const cfg = getLiveCfg(data);

  safeText("liveTitle", cfg?.title, "—");
  safeText("liveMsg", cfg?.message, "—");
  safeImg("liveImg", cfg?.image, "images/panne.png");

  // "Severity" = Mode chez toi → on affiche severity si existe sinon mode
  const sev = pickFirst(cfg, ["severity"]) || mode || "info";
  safeText("liveSev", sev);

  // Chemin image toujours visible
  const imgPath = pickFirst(cfg, ["image","img","image_path","imagePath"]) || "images/panne.png";
  safeText("liveImagePath", imgPath);

  // Création / Diffusion (grâce aux champs qu’on va écrire à chaque publish)
  const created = pickFirst(data, ["created_at","createdAt"]) ?? data.last_update ?? "";
  safeText("liveCreated", created);

  const starts = pickFirst(data, ["starts_at","startsAt"]) ?? pickFirst(data, ["published_at","publishedAt"]) ?? data.last_update ?? "";
  const ends = pickFirst(data, ["ends_at","endsAt"]) ?? "";

  safeText("liveStarts", starts);
  safeText("liveEnds", ends ? ends : "—");

  const extraEl = $("liveExtra");
  if(extraEl){
    if(active && mode === "warning"){
      const clickMsg = data?.modes?.warning?.warning_click_message || "";
      const sched = data?.modes?.warning?.block_schedule || {};
      const schedTxt = sched?.enabled ? `Blocage plage ${sched.start || "—"} → ${sched.end || "—"}` : "Blocage 24/24";
      extraEl.textContent = (clickMsg ? (clickMsg + " • ") : "") + schedTxt;
    } else {
      extraEl.textContent = "";
    }
  }
}

function renderPreview(data){
  const active = getVal("active", "false") === "true";
  const mode = getVal("mode", "none");

  if ($("pActive")) $("pActive").textContent = active ? "ACTIF" : "INACTIF";
  if ($("pMode")) $("pMode").textContent = mode;
  if ($("pUpdated")) $("pUpdated").textContent = data.last_update || "";

  const cfg = data.modes?.[mode] || {};

  if ($("pTitle")) $("pTitle").textContent = cfg.title || "(titre)";
  if ($("pMsg")) $("pMsg").textContent = cfg.message || "(message)";
  if ($("pSev")) $("pSev").textContent = mode || "—";

  const imgSrc = cfg.image ? cfg.image : "images/panne.png";
  if ($("pImg")) $("pImg").src = imgSrc;
}

function setFormFromStatus(data){
  setVal("active", String(!!data.active));

  let uiMode = "none";
  let presetKey = "libre";
  const rawMode = data.mode || "none";

  if(rawMode === "info" || rawMode === "warning" || rawMode === "none"){
    uiMode = rawMode;
    presetKey = "libre";
  } else {
    presetKey = rawMode;
    const cfgOld = data.presets?.[presetKey] || data.modes?.[presetKey] || {};
    const sev = String(cfgOld.severity || "info");
    uiMode = (sev === "warning" || sev === "danger") ? "warning" : "info";
  }

  if(!data.active) uiMode = "none";

  setVal("mode", uiMode);

  fillPresetSelect(data);
  if($("preset")) setVal("preset", presetKey);

  const preset = data.presets?.[presetKey] || {};
  setVal("title", preset.title || "");
  setVal("message", preset.message || "");
  setVal("image", preset.image || "");

  const infoCfg = data.modes?.info || {};
  setVal("okDelay", String(infoCfg.ok_delay_seconds ?? 5));

  const warnCfg = data.modes?.warning || {};
  setVal("warningClickMsg", warnCfg.warning_click_message || "Ce n'est actuellement pas possible de commander.");
  const sched = warnCfg.block_schedule || {};
  setVal("schedEnabled", String(!!sched.enabled));
  setVal("schedStart", sched.start || "19:00");
  setVal("schedEnd", sched.end || "06:00");
  setCheckedDays(sched.days || [1,2,3,4,5,6,0]);

  syncModePanels();

  renderPreview(buildUpdatedStatus(data));
  renderLivePreview(data);
}

function buildUpdatedStatus(current){
  const data = (window.structuredClone ? structuredClone(current) : JSON.parse(JSON.stringify(current)));

  const active = getVal("active", "false") === "true";
  let mode = getVal("mode", "none");
  const presetKey = getVal("preset","libre");

  if (!active){
    mode = "none";
    setVal("mode", "none");
  }

  data.active = active;
  data.mode = mode;
  data.last_update = nowIsoParisish();

  // ✅ AJOUT: métadonnées pour "Création / Diffusion"
  if(!data.created_at) data.created_at = data.last_update;   // une seule fois
  data.published_at = data.last_update;                      // à chaque publication
  if(active && mode !== "none"){
    if(!data.starts_at) data.starts_at = data.last_update;   // diffusion “démarre maintenant”
    if(data.ends_at === undefined) data.ends_at = "";        // vide = pas de fin fixe
  } else {
    if(data.ends_at === undefined) data.ends_at = "";
  }

  if (!data.modes) data.modes = {};
  if (!data.presets) data.presets = {};

  if(!data.modes.info) data.modes.info = { title:"", message:"", image:"images/panne.png", severity:"info", ok_delay_seconds:5 };
  if(!data.modes.warning) data.modes.warning = {
    title:"", message:"", image:"images/panne.png", severity:"warning", block_order:true,
    warning_click_message:"Ce n'est actuellement pas possible de commander.",
    block_schedule:{ enabled:false, days:[1,2,3,4,5,6,0], start:"19:00", end:"06:00" }
  };

  const title = getVal("title","").trim();
  const message = getVal("message","").trim();
  const image = getVal("image","").trim();

  if(presetKey && presetKey !== "libre"){
    if(!data.presets[presetKey]) data.presets[presetKey] = {};
    data.presets[presetKey].title = title;
    data.presets[presetKey].message = message;
    data.presets[presetKey].image = image;
  }

  if (mode !== "none" && active){
    if(mode === "info"){
      data.modes.info.title = title;
      data.modes.info.message = message;
      data.modes.info.image = image;
      data.modes.info.severity = "info";
      const d = parseInt(getVal("okDelay","5"),10);
      data.modes.info.ok_delay_seconds = Number.isFinite(d) && d >= 0 ? d : 5;
    }

    if(mode === "warning"){
      data.modes.warning.title = title;
      data.modes.warning.message = message;
      data.modes.warning.image = image;
      data.modes.warning.severity = "warning";
      data.modes.warning.block_order = true;
      data.modes.warning.warning_click_message = getVal("warningClickMsg","Ce n'est actuellement pas possible de commander.").trim();
      data.modes.warning.block_schedule = {
        enabled: getVal("schedEnabled","false") === "true",
        start: getVal("schedStart","19:00"),
        end: getVal("schedEnd","06:00"),
        days: getCheckedDays()
      };
    }
  }

  return data;
}

function b64encodeUtf8(str){
  const bytes = new TextEncoder().encode(String(str));
  let bin = "";
  for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function githubGetFileMeta({owner, repo, path, branch, token}){
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const r = await fetch(url, {
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if(!r.ok){
    const t = await r.text();
    throw new Error(`GitHub GET meta failed (${r.status}): ${t}`);
  }
  return await r.json();
}

async function githubPutFile({owner, repo, path, branch, token, contentText, sha}){
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const body = {
    message: `Update ${path} via Status Admin`,
    content: b64encodeUtf8(contentText),
    branch
  };
  if(sha) body.sha = sha;

  const r = await fetch(url, {
    method: "PUT",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if(!r.ok){
    const t = await r.text();
    throw new Error(`GitHub PUT failed (${r.status}): ${t}`);
  }
  return await r.json();
}

function startClock(){
  const clock = $("clock");
  const today = $("today");
  const fmtTime = new Intl.DateTimeFormat("fr-FR", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
  const fmtDate = new Intl.DateTimeFormat("fr-FR", { weekday:"long", year:"numeric", month:"long", day:"2-digit" });
  const tick = () => {
    const d = new Date();
    if(clock) clock.textContent = fmtTime.format(d);
    if(today) today.textContent = fmtDate.format(d);
  };
  tick();
  setInterval(tick, 1000);
}

async function refreshOnlinePublished(){
  try{
    const raw = await loadStatus();
    const normalized = normalizeStatus(raw);
    renderLivePreview(normalized);
  }catch(e){
    console.warn("refreshOnlinePublished failed", e);
  }
}

async function main(){
  startClock();

  setVal("ghOwner", localStorage.getItem("gh_owner") || getVal("ghOwner","bullyto") || "bullyto");
  setVal("ghRepo", localStorage.getItem("gh_repo") || getVal("ghRepo","status") || "status");
  setVal("ghBranch", localStorage.getItem("gh_branch") || getVal("ghBranch","main") || "main");
  setVal("ghPath", localStorage.getItem("gh_path") || getVal("ghPath","status.json") || "status.json");

  let currentRaw = await loadStatus();
  let current = normalizeStatus(currentRaw);

  if ($("mode")){
    $("mode").innerHTML =
      `<option value="none">Aucun (service OK)</option>` +
      ["info","warning"].map(m => `<option value="${m}">${m}</option>`).join("");
  }

  setFormFromStatus(current);

  const rerender = () => {
    syncModePanels();
    renderPreview(buildUpdatedStatus(current));
  };

  if($("preset")) $("preset").addEventListener("change", ()=>{
    const key = getVal("preset","libre");
    const p = current.presets?.[key] || {};
    setVal("title", p.title || "");
    setVal("message", p.message || "");
    setVal("image", p.image || "");
    rerender();
  });

  if ($("active")) $("active").addEventListener("change", rerender);
  if ($("mode")) $("mode").addEventListener("change", ()=> { syncModePanels(); rerender(); });

  ["title","message","image","okDelay","schedEnabled","schedStart","schedEnd","warningClickMsg"].forEach(id => {
    const el = $(id);
    if(el) el.addEventListener("input", rerender);
    if(el) el.addEventListener("change", rerender);
  });
  if($("schedDays")) $("schedDays").addEventListener("change", rerender);

  if ($("btnSaveToken")) $("btnSaveToken").addEventListener("click", ()=>{
    const token = readTokenUnified();
    if(!token){ toast("Token vide."); return; }
    localStorage.setItem("gh_token", token);
    toast("Token enregistré sur ce téléphone.");
  });
  if ($("btnClearToken")) $("btnClearToken").addEventListener("click", ()=>{
    localStorage.removeItem("gh_token");
    setVal("ghToken","");
    toast("Token supprimé.");
  });

  ["ghOwner","ghRepo","ghBranch","ghPath"].forEach(id => {
    const el = $(id);
    if(!el) return;
    el.addEventListener("change", ()=>{
      localStorage.setItem(id.replace("gh","gh_").toLowerCase(), getVal(id,""));
    });
  });

  if ($("btnPublish")) $("btnPublish").addEventListener("click", async ()=>{
    try{
      const owner  = getVal("ghOwner", "bullyto");
      const repo   = getVal("ghRepo", "status");
      const branch = getVal("ghBranch", "main");
      const path   = getVal("ghPath", "status.json");
      const token  = readTokenUnified();

      if(!owner || !repo || !path) { toast("Config manquante."); return; }
      if(!token){ toast("Ajoute ton token GitHub."); return; }

      toast("Lecture du fichier sur GitHub...");
      const meta = await githubGetFileMeta({owner, repo, path, branch, token});
      const sha = meta.sha;

      const updated = buildUpdatedStatus(current);
      const contentText = JSON.stringify(updated, null, 2);

      toast("Publication sur GitHub...");
      await githubPutFile({owner, repo, path, branch, token, contentText, sha});

      current = updated;

      toast("Vérification en ligne...");
      await refreshOnlinePublished();

      toast("Publié ✅");
    } catch(err){
      console.error(err);
      toast("Erreur GitHub : " + (err?.message || err));
    }
  });

  refreshOnlinePublished();
}

main();
