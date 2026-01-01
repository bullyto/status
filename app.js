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

/** token unifié : accepte gh_token_v1 (avec exp) OU gh_token (legacy) */
function readTokenUnified(){
  // 1) champ
  const fromInput = getVal("ghToken","").trim();
  if(fromInput) return fromInput;

  // 2) legacy string
  const legacy = (localStorage.getItem("gh_token") || "").trim();
  if(legacy) return legacy;

  // 3) v1 JSON avec exp
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

function setFormFromStatus(data){
  setVal("active", String(!!data.active));
  setVal("mode", data.mode || "none");

  const m = data.modes || {};
  const selected = getVal("mode", "none");
  const cfg = m[selected] || {};

  // Normalisation : seulement info / warning
  const sev = (cfg.severity === "warning") ? "warning" : "info";
  setVal("severity", sev);

  setVal("title", cfg.title || "");
  setVal("message", cfg.message || "");
  setVal("image", cfg.image || "");

  // info
  setVal("okDelay", String(cfg.ok_delay_seconds ?? 5));

  // warning
  setVal("warningClickMsg", cfg.warning_click_message || "Ce n'est actuellement pas possible de commander.");
  const sched = cfg.block_schedule || {};
  setVal("schedEnabled", String(!!sched.enabled));
  setVal("schedStart", sched.start || "19:00");
  setVal("schedEnd", sched.end || "06:00");
  setCheckedDays(sched.days || [1,2,3,4,5,6,0]);

  syncModePanels();
  renderPreview(data);
}

function syncModePanels(){
  const mode = getVal("mode","none");
  const sev = (mode === "warning") ? "warning" : "info";
  // On force la cohérence : mode=info => severity=info ; mode=warning => severity=warning
  if($("severity")) setVal("severity", sev);

  const infoBox = $("infoBox");
  const warningBox = $("warningBox");
  if(infoBox) infoBox.classList.toggle("ui-hide", mode !== "info");
  if(warningBox) warningBox.classList.toggle("ui-hide", mode !== "warning");
}

function renderPreview(data){
  const active = getVal("active", "false") === "true";
  const mode = getVal("mode", "none");
  const cfg = data.modes?.[mode] || {};

  if ($("pActive")) $("pActive").textContent = active ? "ACTIF" : "INACTIF";
  if ($("pMode")) $("pMode").textContent = mode;
  if ($("pUpdated")) $("pUpdated").textContent = data.last_update || "";

  if ($("pTitle")) $("pTitle").textContent = cfg.title || "(titre)";
  if ($("pMsg")) $("pMsg").textContent = cfg.message || "(message)";
  if ($("pSev")) $("pSev").textContent = (mode === "warning") ? "warning" : "info";

  const imgSrc = cfg.image ? cfg.image : "images/panne.png";
  if ($("pImg")) $("pImg").src = imgSrc;

  const extra = $("pExtra");
  if(extra){
    if(mode === "info"){
      const d = cfg.ok_delay_seconds ?? 5;
      extra.textContent = active ? `Info : bouton OK débloqué après ${d}s.` : "";
    } else if(mode === "warning"){
      const sched = cfg.block_schedule || {};
      const on = !!sched.enabled;
      const days = (sched.days||[]).length ? sched.days.join(",") : "—";
      extra.textContent = active
        ? (on ? `Warning : blocage sur horaire (${sched.start||"?"}→${sched.end||"?"}), jours [${days}]` : "Warning : commande bloquée 24/24")
        : "";
    } else {
      extra.textContent = "";
    }
  }
}

function buildUpdatedStatus(current){
  const data = (window.structuredClone ? structuredClone(current) : JSON.parse(JSON.stringify(current)));

  const active = getVal("active", "false") === "true";
  let mode = getVal("mode", "none");

  // ✅ GARANTIE “retirer la pop-up”
  if (!active){
    mode = "none";
    setVal("mode", "none");
    setVal("title", "");
    setVal("message", "");
    setVal("image", "");
    setVal("severity", "info");
  }

  data.active = active;
  data.mode = mode;
  data.last_update = nowIsoParisish();

  if (!data.modes) data.modes = {};

  // On garantit l'existence des 2 modes côté JSON
  if(!data.modes.info) data.modes.info = {};
  if(!data.modes.warning) data.modes.warning = {};

  if (mode !== "none" && active){
    if (!data.modes[mode]) data.modes[mode] = {};

    // champs communs
    data.modes[mode].title = getVal("title", "").trim();
    data.modes[mode].message = getVal("message", "").trim();
    data.modes[mode].image = getVal("image", "").trim();

    // cohérence : severity suit le mode
    if(mode === "warning"){
      data.modes[mode].severity = "warning";
      data.modes[mode].block_order = true;

      data.modes[mode].warning_click_message = getVal("warningClickMsg","Ce n'est actuellement pas possible de commander.").trim();

      const enabled = getVal("schedEnabled","false") === "true";
      data.modes[mode].block_schedule = {
        enabled,
        start: getVal("schedStart","19:00"),
        end: getVal("schedEnd","06:00"),
        days: getCheckedDays()
      };
    } else {
      data.modes[mode].severity = "info";
      const d = parseInt(getVal("okDelay","5"),10);
      data.modes[mode].ok_delay_seconds = Number.isFinite(d) && d >= 0 ? d : 5;
      // info => pas de blocage commande
      delete data.modes[mode].block_order;
      delete data.modes[mode].block_schedule;
      delete data.modes[mode].warning_click_message;
    }
  }

  return data;
}

// Base64 UTF-8 robuste
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

async function main(){
  startClock();

  // defaults robustes
  setVal("ghOwner", localStorage.getItem("gh_owner") || getVal("ghOwner","bullyto") || "bullyto");
  setVal("ghRepo", localStorage.getItem("gh_repo") || getVal("ghRepo","status") || "status");
  setVal("ghBranch", localStorage.getItem("gh_branch") || getVal("ghBranch","main") || "main");
  setVal("ghPath", localStorage.getItem("gh_path") || getVal("ghPath","status.json") || "status.json");

  let current = await loadStatus();

  // On force la présence de 2 modes seulement dans le sélecteur
  const modeOptions = ["info","warning"];
  if ($("mode")){
    $("mode").innerHTML =
      `<option value="none">Aucun (service OK)</option>` +
      modeOptions.map(m => `<option value="${m}">${m}</option>`).join("");
  }

  setFormFromStatus(current);

  const rerender = () => {
    syncModePanels();
    renderPreview(buildUpdatedStatus(current));
  };

  if ($("active")) $("active").addEventListener("change", rerender);
  if ($("mode")) $("mode").addEventListener("change", ()=> {
    // quand on change de mode, on recharge les champs depuis current.modes[mode]
    const mode = getVal("mode","none");
    const cfg = current.modes?.[mode] || {};
    setVal("title", cfg.title || "");
    setVal("message", cfg.message || "");
    setVal("image", cfg.image || "");

    if(mode === "info"){
      setVal("okDelay", String(cfg.ok_delay_seconds ?? 5));
    }
    if(mode === "warning"){
      setVal("warningClickMsg", cfg.warning_click_message || "Ce n'est actuellement pas possible de commander.");
      const sched = cfg.block_schedule || {};
      setVal("schedEnabled", String(!!sched.enabled));
      setVal("schedStart", sched.start || "19:00");
      setVal("schedEnd", sched.end || "06:00");
      setCheckedDays(sched.days || [1,2,3,4,5,6,0]);
    }
    rerender();
  });

  // champs communs + champs spécifiques
  ["title","message","image","okDelay","schedEnabled","schedStart","schedEnd","warningClickMsg"].forEach(id => {
    const el = $(id);
    if(el) el.addEventListener("input", rerender);
    if(el) el.addEventListener("change", rerender);
  });
  if($("schedDays")) $("schedDays").addEventListener("change", rerender);

  // Sauvegarde legacy optionnelle (si tu l'utilises encore)
  if ($("btnSaveToken")) $("btnSaveToken").addEventListener("click", ()=>{
    const token = readTokenUnified();
    if(!token){ toast("Token vide."); return; }
    localStorage.setItem("gh_token", token); // garde compat
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
      toast("Publié ✅");
    } catch(err){
      console.error(err);
      toast("Erreur GitHub : " + (err?.message || err));
    }
  });
}

main();
