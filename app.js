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
  t.style.display = "block";
  clearTimeout(window.__toast);
  window.__toast = setTimeout(()=> t.style.display="none", 2400);
}

async function loadStatus(){
  const r = await fetch("./status.json", { cache: "no-store" });
  return await r.json();
}

function setFormFromStatus(data){
  setVal("active", String(!!data.active));
  setVal("mode", data.mode || "none");

  const m = data.modes || {};
  const selected = getVal("mode", "none");
  const cfg = m[selected] || {};

  setVal("title", cfg.title || "");
  setVal("message", cfg.message || "");
  setVal("image", cfg.image || "");
  setVal("severity", cfg.severity || "info");

  renderPreview(data);
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
  if ($("pSev")) $("pSev").textContent = cfg.severity || "info";

  const imgSrc = cfg.image ? cfg.image : "images/panne.png";
  if ($("pImg")) $("pImg").src = imgSrc;
}

function buildUpdatedStatus(current){
  const data = structuredClone(current);

  const active = getVal("active", "false") === "true";
  let mode = getVal("mode", "none");

  // ✅ GARANTIE “retirer la pop-up”
  // Si inactive => on force mode=none + champs vides pour éviter tout affichage côté client.
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

  if (mode !== "none" && active){
    if (!data.modes[mode]) data.modes[mode] = {};
    data.modes[mode].title = getVal("title", "").trim();
    data.modes[mode].message = getVal("message", "").trim();
    data.modes[mode].image = getVal("image", "").trim();
    data.modes[mode].severity = getVal("severity", "info");
  }

  return data;
}

function downloadJson(filename, obj){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function b64encodeUtf8(str){
  return btoa(unescape(encodeURIComponent(str)));
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

async function main(){
  // ✅ defaults robustes même si les inputs sont cachés / absents
  setVal("ghOwner", localStorage.getItem("gh_owner") || getVal("ghOwner","bullyto") || "bullyto");
  setVal("ghRepo", localStorage.getItem("gh_repo") || getVal("ghRepo","status") || "status");
  setVal("ghBranch", localStorage.getItem("gh_branch") || getVal("ghBranch","main") || "main");
  setVal("ghPath", localStorage.getItem("gh_path") || getVal("ghPath","status.json") || "status.json");
  setVal("ghToken", localStorage.getItem("gh_token") || getVal("ghToken","") || "");

  let current = await loadStatus();

  const modes = Object.keys(current.modes || {});
  if ($("mode")){
    $("mode").innerHTML =
      `<option value="none">Aucun (service OK)</option>` +
      modes.map(m => `<option value="${m}">${m}</option>`).join("");
  }

  setFormFromStatus(current);

  if ($("active")) $("active").addEventListener("change", ()=> renderPreview(buildUpdatedStatus(current)));
  if ($("mode")) $("mode").addEventListener("change", ()=> {
    const mode = getVal("mode","none");
    const cfg = current.modes?.[mode] || {};
    setVal("title", cfg.title || "");
    setVal("message", cfg.message || "");
    setVal("image", cfg.image || "");
    setVal("severity", cfg.severity || "info");
    renderPreview(buildUpdatedStatus(current));
  });

  ["title","message","image","severity"].forEach(id => {
    const el = $(id);
    if(el) el.addEventListener("input", ()=> renderPreview(buildUpdatedStatus(current)));
  });

  if ($("btnDownload")) $("btnDownload").addEventListener("click", ()=>{
    const updated = buildUpdatedStatus(current);
    downloadJson("status.json", updated);
    toast("status.json téléchargé.");
  });

  if ($("btnServiceOK")) $("btnServiceOK").addEventListener("click", ()=>{
    setVal("active","false");
    setVal("mode","none");
    setVal("title","");
    setVal("message","");
    setVal("image","");
    setVal("severity","info");
    renderPreview(buildUpdatedStatus(current));
    toast("Mode 'service OK' prêt.");
  });

  if ($("btnPreviewPopup")) $("btnPreviewPopup").addEventListener("click", ()=>{
    const data = buildUpdatedStatus(current);
    if (!data.active){ toast("Active d'abord le statut."); return; }
    const cfg = data.modes?.[data.mode];
    if (!cfg){ toast("Mode invalide."); return; }

    if ($("overlayImg")) $("overlayImg").src = cfg.image || "images/panne.png";
    if ($("overlayTitle")) $("overlayTitle").textContent = cfg.title || "Information";
    if ($("overlayMsg")) $("overlayMsg").textContent = cfg.message || "";
    if ($("overlay")) $("overlay").style.display = "flex";
  });

  if ($("overlayBtn")) $("overlayBtn").addEventListener("click", ()=> { if ($("overlay")) $("overlay").style.display = "none"; });
  if ($("overlay")) $("overlay").addEventListener("click", (e)=> { if (e.target === $("overlay")) $("overlay").style.display = "none"; });

  if ($("btnSaveToken")) $("btnSaveToken").addEventListener("click", ()=>{
    const token = getVal("ghToken","").trim();
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
      const token  = getVal("ghToken","") || (localStorage.getItem("gh_token") || "").trim();

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
