const $ = (id) => document.getElementById(id);

const DEFAULT_STATUS_URL_HINT = "Si tu héberges ce dépôt sur GitHub Pages : https://TON-USER.github.io/NOM-DEPOT/status.json";

function nowIsoParisish(){
  // keep simple; user can change later
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
  window.__toast = setTimeout(()=> t.style.display="none", 2200);
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

async function main(){
  // PWA install
  if ("serviceWorker" in navigator){
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  }

  $("hint").textContent = DEFAULT_STATUS_URL_HINT;

  let current = await loadStatus();

  // fill mode options
  const modes = Object.keys(current.modes || {});
  const sel = $("mode");
  // ensure default
  sel.innerHTML = `<option value="none">Aucun (service OK)</option>` + modes.map(m => `<option value="${m}">${m}</option>`).join("");
  setFormFromStatus(current);

  // when changing active/mode, update form fields from selected mode
  $("active").addEventListener("change", ()=> {
    const updated = buildUpdatedStatus(current);
    renderPreview(updated);
  });

  $("mode").addEventListener("change", ()=> {
    const mode = $("mode").value;
    const cfg = current.modes?.[mode] || {};
    $("title").value = cfg.title || "";
    $("message").value = cfg.message || "";
    $("image").value = cfg.image || "";
    $("severity").value = cfg.severity || "info";
    const updated = buildUpdatedStatus(current);
    renderPreview(updated);
  });

  ["title","message","image","severity"].forEach(id => {
    $(id).addEventListener("input", ()=> {
      const updated = buildUpdatedStatus(current);
      renderPreview(updated);
    });
  });

  $("btnDownload").addEventListener("click", ()=>{
    const updated = buildUpdatedStatus(current);
    downloadJson("status.json", updated);
    toast("status.json téléchargé (à remplacer dans le dépôt).");
  });

  $("btnReset").addEventListener("click", async ()=>{
    current = await loadStatus();
    // repopulate form
    const modes = Object.keys(current.modes || {});
    $("mode").innerHTML = `<option value="none">Aucun (service OK)</option>` + modes.map(m => `<option value="${m}">${m}</option>`).join("");
    setFormFromStatus(current);
    toast("Rechargé depuis status.json du site.");
  });

  $("btnServiceOK").addEventListener("click", ()=>{
    $("active").value = "false";
    $("mode").value = "none";
    $("title").value = "";
    $("message").value = "";
    $("image").value = "";
    $("severity").value = "info";
    const updated = buildUpdatedStatus(current);
    renderPreview(updated);
    toast("Mode 'service OK' prêt. Télécharge le status.json.");
  });

  $("btnPreviewPopup").addEventListener("click", ()=>{
    // show the same popup used by your customer sites
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
}

main();
