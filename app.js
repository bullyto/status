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

function doServiceOK(){
  $("active").value = "false";
  $("mode").value = "none";
  $("title").value = "";
  $("message").value = "";
  $("image").value = "";
  $("severity").value = "info";
  toast("Mode OK prêt.");
}

function doPreview(current){
  const data = buildUpdatedStatus(current);
  if (!data.active){ toast("Active d'abord le statut."); return; }
  const cfg = data.modes?.[data.mode];
  if (!cfg){ toast("Mode invalide."); return; }

  $("overlayImg").src = cfg.image || "images/panne.png";
  $("overlayTitle").textContent = cfg.title || "Information";
  $("overlayMsg").textContent = cfg.message || "";
  $("overlay").style.display = "flex";
}

function getCfg(){
  const cfg = window.__cfg || {};
  const owner  = (cfg.o || "").trim();
  const repo   = (cfg.r || "").trim();
  const branch = (cfg.b || "main").trim();
  const path   = (cfg.p || "status.json").trim();
  const token  = (typeof cfg.t === "function" ? cfg.t() : "").trim();
  return { owner, repo, branch, path, token };
}

async function doPublish(currentRef){
  const { owner, repo, branch, path, token } = getCfg();
  if(!owner || !repo || !path){ toast("Config manquante."); return; }
  if(!token){ toast("Token manquant."); return; }

  toast("Lecture GitHub...");
  const meta = await githubGetFileMeta({owner, repo, path, branch, token});
  const sha = meta.sha;

  const updated = buildUpdatedStatus(currentRef.current);
  const contentText = JSON.stringify(updated, null, 2);

  toast("Publication...");
  await githubPutFile({owner, repo, path, branch, token, contentText, sha});

  currentRef.current = updated;
  toast("Publié ✅");
}

function wireHiddenShortcuts(btn, currentRef){
  let taps = 0;
  let tapTimer = null;
  let longTimer = null;
  let longFired = false;

  const reset = () => {
    taps = 0;
    longFired = false;
    if(tapTimer){ clearTimeout(tapTimer); tapTimer = null; }
    if(longTimer){ clearTimeout(longTimer); longTimer = null; }
  };

  const scheduleTapResolve = () => {
    if(tapTimer) clearTimeout(tapTimer);
    tapTimer = setTimeout(async () => {
      const n = taps;
      taps = 0;

      try{
        if(n >= 3){
          const updated = buildUpdatedStatus(currentRef.current);
          downloadJson("status.json", updated);
          toast("Téléchargé.");
          return;
        }
        if(n === 2){
          doPreview(currentRef.current);
          return;
        }
        if(n === 1){
          await doPublish(currentRef);
          return;
        }
      } catch(e){
        console.error(e);
        toast("Erreur : " + (e?.message || e));
      }
    }, 320);
  };

  const onDown = (e) => {
    longFired = false;
    if(longTimer) clearTimeout(longTimer);
    longTimer = setTimeout(() => {
      longFired = true;
      doServiceOK();
      renderPreview(buildUpdatedStatus(currentRef.current));
    }, 1200);
  };

  const onUp = () => {
    if(longTimer){ clearTimeout(longTimer); longTimer = null; }
    if(longFired){
      reset();
      return;
    }
    taps++;
    scheduleTapResolve();
  };

  btn.addEventListener("pointerdown", onDown);
  btn.addEventListener("pointerup", onUp);
  btn.addEventListener("pointercancel", reset);
  btn.addEventListener("pointerleave", () => { if(longTimer) clearTimeout(longTimer); });
}

async function main(){
  let current = await loadStatus();
  const currentRef = { current };

  const modes = Object.keys(current.modes || {});
  $("mode").innerHTML =
    `<option value="none">Aucun (service OK)</option>` +
    modes.map(m => `<option value="${m}">${m}</option>`).join("");

  setFormFromStatus(current);

  $("active").addEventListener("change", ()=> renderPreview(buildUpdatedStatus(currentRef.current)));
  $("mode").addEventListener("change", ()=> {
    const mode = $("mode").value;
    const cfg = currentRef.current.modes?.[mode] || {};
    $("title").value = cfg.title || "";
    $("message").value = cfg.message || "";
    $("image").value = cfg.image || "";
    $("severity").value = cfg.severity || "info";
    renderPreview(buildUpdatedStatus(currentRef.current));
  });
  ["title","message","image","severity"].forEach(id => {
    $(id).addEventListener("input", ()=> renderPreview(buildUpdatedStatus(currentRef.current)));
  });

  $("overlayBtn").addEventListener("click", ()=> $("overlay").style.display = "none");
  $("overlay").addEventListener("click", (e)=> { if (e.target === $("overlay")) $("overlay").style.display = "none"; });

  const btn = $("btnPublish");
  wireHiddenShortcuts(btn, currentRef);

  renderPreview(buildUpdatedStatus(currentRef.current));
}

main();
