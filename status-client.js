const StatusClient = (() => {
  function qs(sel){ return document.querySelector(sel); }

  function withinSchedule(schedule, now = new Date()){
    if(!schedule || !schedule.enabled) return true; // enabled=false => bloquer tout le temps
    const days = Array.isArray(schedule.days) ? schedule.days : [];
    const day = now.getDay(); // 0=Dim
    if(days.length && !days.includes(day)) return false;

    const [sh, sm] = String(schedule.start||"00:00").split(":").map(n=>parseInt(n,10));
    const [eh, em] = String(schedule.end||"00:00").split(":").map(n=>parseInt(n,10));
    if(!Number.isFinite(sh)||!Number.isFinite(sm)||!Number.isFinite(eh)||!Number.isFinite(em)) return true;

    const startMin = sh*60+sm;
    const endMin = eh*60+em;
    const nowMin = now.getHours()*60+now.getMinutes();

    if(startMin === endMin) return true;
    if(startMin < endMin){
      return nowMin >= startMin && nowMin < endMin;
    } else {
      return (nowMin >= startMin) || (nowMin < endMin);
    }
  }

  function ensureOverlay(){
    if(document.getElementById("statusOverlay")) return;

    const wrap = document.createElement("div");
    wrap.id = "statusOverlay";
    wrap.style.cssText = "display:none; position:fixed; inset:0; background:rgba(0,0,0,.65); z-index:999999; align-items:center; justify-content:center; padding:16px;";
    wrap.innerHTML = `
      <div style="max-width:520px; width:100%; background:#111; border:1px solid rgba(255,255,255,.12); border-radius:16px; overflow:hidden; position:relative;">
        <button id="statusClose" aria-label="Fermer" style="position:absolute; top:10px; right:10px; width:40px; height:40px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background:rgba(0,0,0,.35); color:#fff; font-size:18px; line-height:1; cursor:pointer;">✕</button>
        <img id="statusImg" alt="" style="width:100%; display:block;">
        <div style="padding:14px 14px 16px; color:#fff; font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Helvetica,Arial;">
          <div id="statusTitle" style="font-size:18px; font-weight:800; margin-bottom:6px;"></div>
          <div id="statusMsg" style="font-size:14px; line-height:1.35; opacity:.92;"></div>
          <div id="statusSecondary" style="font-size:12px; line-height:1.25; opacity:.75; margin-top:10px;"></div>
          <button id="statusOk" style="margin-top:12px; width:100%; padding:10px; border-radius:12px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.08); color:#fff; cursor:pointer;">
            OK j'ai compris
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
  }

  async function fetchStatus(url){
    const r = await fetch(url, { cache:"no-store" });
    if(!r.ok) throw new Error("status fetch failed");
    return await r.json();
  }

  function init({statusUrl, orderButtonSelector}){
    ensureOverlay();
    const overlay = document.getElementById("statusOverlay");
    const img = document.getElementById("statusImg");
    const title = document.getElementById("statusTitle");
    const msg = document.getElementById("statusMsg");
    const secondary = document.getElementById("statusSecondary");
    const okBtn = document.getElementById("statusOk");
    const closeBtn = document.getElementById("statusClose");
    const orderBtn = orderButtonSelector ? qs(orderButtonSelector) : null;

    function setOrderEnabled(enabled){
      if(!orderBtn) return;
      orderBtn.disabled = !enabled;
      orderBtn.style.opacity = enabled ? "" : "0.5";
      orderBtn.style.cursor = enabled ? "" : "not-allowed";
    }

    function show(){
      overlay.style.display = "flex";
      // empêche scroll de fond
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    }
    function hide(){
      overlay.style.display = "none";
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }

    // par défaut: aucune fermeture par clic dehors
    overlay.onclick = (e) => { /* volontairement vide */ };

    (async()=>{
      let data;
      try{ data = await fetchStatus(statusUrl); }catch(e){ return; }

      if(!data || !data.active) return;

      const mode = data.mode || "none";
      const cfg = data.modes?.[mode];
      if(!cfg) return;

      img.src = cfg.image || "images/panne.png";
      title.textContent = cfg.title || "Information";
      msg.textContent = cfg.message || "";
      secondary.textContent = "";

      show();

      // INFO
      if(mode === "info"){
        const delay = Number.isFinite(cfg.ok_delay_seconds) ? cfg.ok_delay_seconds : 5;

        // pendant le délai: impossible de fermer (ok + croix + clic dehors)
        okBtn.disabled = true;
        closeBtn.disabled = true;
        okBtn.style.opacity = "0.6";
        closeBtn.style.opacity = "0.6";
        closeBtn.style.cursor = "not-allowed";

        okBtn.textContent = `OK j'ai compris (dans ${delay}s)`;

        let left = delay;
        const t = setInterval(()=>{
          left -= 1;
          if(left <= 0){
            clearInterval(t);
            okBtn.disabled = false;
            closeBtn.disabled = false;
            okBtn.style.opacity = "";
            closeBtn.style.opacity = "";
            closeBtn.style.cursor = "pointer";
            okBtn.textContent = "OK j'ai compris";
          } else {
            okBtn.textContent = `OK j'ai compris (dans ${left}s)`;
          }
        }, 1000);

        okBtn.onclick = () => { if(okBtn.disabled) return; hide(); };
        closeBtn.onclick = () => { if(closeBtn.disabled) return; hide(); };

        // après délai, on autorise aussi clic dehors pour fermer (optionnel)
        overlay.onclick = (e) => {
          if(e.target === overlay && !okBtn.disabled) hide();
        };

        // info => commande possible
        setOrderEnabled(true);
      }

      // WARNING
      if(mode === "warning"){
        const schedule = cfg.block_schedule || { enabled:false };
        const blockedNow = withinSchedule(schedule, new Date());
        setOrderEnabled(!blockedNow);

        // warning: impossible de fermer (ok + croix + clic dehors)
        okBtn.disabled = false; // clique possible mais ne ferme pas
        closeBtn.disabled = true;
        closeBtn.style.opacity = "0.6";
        closeBtn.style.cursor = "not-allowed";

        const clickMsg = cfg.warning_click_message || "Ce n'est actuellement pas possible de commander.";
        secondary.textContent = clickMsg;

        okBtn.onclick = () => {
          secondary.textContent = clickMsg;
          secondary.style.opacity = "1";
          setTimeout(()=> secondary.style.opacity = ".75", 250);
        };
        closeBtn.onclick = () => { /* bloqué */ };
        overlay.onclick = (e) => { /* bloqué */ };
      }
    })();
  }

  return { init };
})();
