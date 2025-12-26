const $ = (id) => document.getElementById(id);

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
  $("active").value = String(!!data.active);
  $("mode").value = data.mode || "none";

  const m = data.modes || {};
  const selected = $("mode").value;
  const cfg = m[selected] || {};

  $("title").value = cfg.title || "";
  $("message").value = cfg.message || "";
  $("image").value = cfg.image || "";
  $("severity").value = cfg.severity || "info";

  renderPreview(data);
}

function renderPreview(data){
  const active = $("active").value === "true";
  const mode = $("mode").value;
  const cfg = data.modes?.[mode] || {};

  $("pActive").textContent = active ? "ACTIF" : "INACTIF";
  $("pMode").textContent = mode;
  $("pUpdated").textContent = data.last_update || "";

  $("pTitle").textContent = cfg.title || "(titre)";
  $("pMsg").textContent = cfg.message || "(message)";
  $("pSev").textContent = cfg.severity || "info";

  const imgSrc = cfg.image ? cfg.image : "images/panne.png";
  $("pImg").src = imgSrc;
}

function buildUpdatedStatus(current){
  const data = structuredClone(current);
  data.active = $("active").value === "true";
  data.mode = $("mode").value;
  data.last_update = nowIsoParisish();

  if (!data.modes) data.modes = {};
  const mode = data.mode;

  if (mode !== "none"){
    if (!data.modes[mode]) data.modes[mode] = {};
    data.modes[mode].title = $("title").value.trim();
    data.modes[mode].message = $("message").value.trim();
    data.modes[mode].image = $("image").value.trim();
    data.modes[mode].severity = $("severity").value;
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
  // base64 for UTF-8
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
  return await r.json(); // contains sha
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
  // PWA install
  if ("serviceWorker" in navigator){
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  }

  // defaults
  $("ghOwner").value = localStorage.getItem("gh_owner") || "bullyto";
  $("ghRepo").value = localStorage.getItem("gh_repo") || "status";
  $("ghBranch").value = localStorage.getItem("gh_branch") || "main";
  $("ghPath").value = localStorage.getItem("gh_path") || "status.json";
  $("ghToken").value = localStorage.getItem("gh_token") || "";

  let current = await loadStatus();

  // fill mode options
  const modes = Object.keys(current.modes || {});
  $("mode").innerHTML = `<option value="none">Aucun (service OK)</option>` + modes.map(m => `<option value="${m}">${m}</option>`).join("");
  setFormFromStatus(current);

  $("active").addEventListener("change", ()=> renderPreview(buildUpdatedStatus(current)));
  $("mode").addEventListener("change", ()=> {
    const mode = $("mode").value;
    const cfg = current.modes?.[mode] || {};
    $("title").value = cfg.title || "";
    $("message").value = cfg.message || "";
    $("image").value = cfg.image || "";
    $("severity").value = cfg.severity || "info";
    renderPreview(buildUpdatedStatus(current));
  });
  ["title","message","image","severity"].forEach(id => {
    $(id).addEventListener("input", ()=> renderPreview(buildUpdatedStatus(current)));
  });

  $("btnDownload").addEventListener("click", ()=>{
    const updated = buildUpdatedStatus(current);
    downloadJson("status.json", updated);
    toast("status.json téléchargé.");
  });

  $("btnServiceOK").addEventListener("click", ()=>{
    $("active").value = "false";
    $("mode").value = "none";
    $("title").value = "";
    $("message").value = "";
    $("image").value = "";
    $("severity").value = "info";
    renderPreview(buildUpdatedStatus(current));
    toast("Mode 'service OK' prêt.");
  });

  $("btnPreviewPopup").addEventListener("click", ()=>{
    const data = buildUpdatedStatus(current);
    if (!data.active){ toast("Active d'abord le statut."); return; }
    const cfg = data.modes?.[data.mode];
    if (!cfg){ toast("Mode invalide."); return; }

    $("overlayImg").src = cfg.image || "images/panne.png";
    $("overlayTitle").textContent = cfg.title || "Information";
    $("overlayMsg").textContent = cfg.message || "";
    $("overlay").style.display = "flex";
  });

  $("overlayBtn").addEventListener("click", ()=> $("overlay").style.display = "none");
  $("overlay").addEventListener("click", (e)=> { if (e.target === $("overlay")) $("overlay").style.display = "none"; });

  // token persistence
  $("btnSaveToken").addEventListener("click", ()=>{
    const token = $("ghToken").value.trim();
    if(!token){ toast("Token vide."); return; }
    localStorage.setItem("gh_token", token);
    toast("Token enregistré sur ce téléphone.");
  });
  $("btnClearToken").addEventListener("click", ()=>{
    localStorage.removeItem("gh_token");
    $("ghToken").value = "";
    toast("Token supprimé.");
  });

  // persist repo settings
  ["ghOwner","ghRepo","ghBranch","ghPath"].forEach(id => {
    $(id).addEventListener("change", ()=>{
      localStorage.setItem(id.replace("gh","gh_").toLowerCase(), $(id).value.trim());
    });
  });

  $("btnPublish").addEventListener("click", async ()=>{
    try{
      const owner = $("ghOwner").value.trim();
      const repo = $("ghRepo").value.trim();
      const branch = $("ghBranch").value.trim() || "main";
      const path = $("ghPath").value.trim() || "status.json";
      const token = $("ghToken").value.trim() || localStorage.getItem("gh_token") || "";

      if(!owner || !repo || !path) { toast("Owner/repo/path manquants."); return; }
      if(!token){ toast("Ajoute ton token GitHub."); return; }

      // get sha of existing file (needed for update)
      toast("Lecture du fichier sur GitHub...");
      const meta = await githubGetFileMeta({owner, repo, path, branch, token});
      const sha = meta.sha;

      const updated = buildUpdatedStatus(current);
      const contentText = JSON.stringify(updated, null, 2);

      toast("Publication sur GitHub...");
      await githubPutFile({owner, repo, path, branch, token, contentText, sha});

      // refresh local current
      current = updated;
      toast("Publié ✅ (GitHub Pages se met à jour).");
    } catch(err){
      console.error(err);
      toast("Erreur GitHub : " + (err?.message || err));
    }
  });
}

main();
