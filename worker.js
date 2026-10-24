/* WorkKaro Worker Dashboard (frontend prototype)
   Rules implemented here:
   - The worker cannot choose a work area. Location comes only from the device (geolocation).
   - Turning on "Open to Work" requires location permission. If it is denied, the toggle stays OFF.
   - Only jobs within 10 km of the device's current position are shown or can be applied to.
   Jobs/applications/earnings are demo data. Job coordinates are generated around the worker's
   first location fix so the demo works anywhere; production must use real employer coordinates
   and enforce the 10 km rule on the server.
*/
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const money = v => "₹" + Number(v || 0).toLocaleString("en-IN");
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const STORE = "workkaro-worker-dashboard-v1";
  const RADIUS_KM = 10;
  const MOVE_REFRESH_KM = 0.15;
  const now = Date.now();

  // dist = km from the demo anchor, bearing = degrees. Three jobs are deliberately outside 10 km.
  const demoJobs = [
    {id:"job-101",title:"Shop Helper",employer:"FreshMart Grocery",pay:600,hours:"Full day",type:"Shop work",skill:"Customer service",posted:now-18*60000,openings:2,dist:1.2,bearing:40,description:"Help customers, arrange shelves and keep the shop organized. Confirm exact shifts and payment terms with the employer before work begins."},
    {id:"job-102",title:"Packing Worker",employer:"SwiftPack Supplies",pay:500,hours:"Half day",type:"Warehouse",skill:"Packing",posted:now-65*60000,openings:4,dist:2.1,bearing:350,description:"Pack and label everyday goods. Training and shift timing should be confirmed with the employer."},
    {id:"job-103",title:"Kitchen Helper",employer:"Green Leaf Cafe",pay:750,hours:"Full day",type:"Food service",skill:"Kitchen support",posted:now-3*3600000,openings:1,dist:3.4,bearing:200,description:"Assist with basic preparation, cleaning work surfaces and organizing supplies. Ask about breaks and shift timing."},
    {id:"job-104",title:"Store Stock Assistant",employer:"DailyNeeds Store",pay:700,hours:"Full day",type:"Retail",skill:"Stock handling",posted:now-5*3600000,openings:2,dist:4.3,bearing:110,description:"Receive stock, arrange products and help maintain inventory. Confirm workload and pay schedule with the employer."},
    {id:"job-105",title:"Cleaning Assistant",employer:"BrightSpace Services",pay:550,hours:"Morning shift",type:"Cleaning",skill:"Cleaning",posted:now-9*3600000,openings:1,dist:2.8,bearing:285,description:"Help maintain a small commercial space. Discuss equipment, safety and shift duration before accepting."},
    {id:"job-106",title:"Delivery Support Helper",employer:"Neighbourhood Traders",pay:900,hours:"Flexible shift",type:"Delivery support",skill:"Local area knowledge",posted:now-24*3600000,openings:3,dist:8.7,bearing:150,description:"Help prepare and organize local orders for dispatch. This is support work, not a promise of delivery-platform employment."},
    {id:"job-107",title:"Construction Helper",employer:"BuildRight Contractors",pay:850,hours:"Full day",type:"Construction",skill:"Site support",posted:now-2*3600000,openings:5,dist:12.6,bearing:75,description:"Outside your 10 km radius, so this job is never shown to you."},
    {id:"job-108",title:"Warehouse Loader",employer:"CargoPoint",pay:800,hours:"Night shift",type:"Warehouse",skill:"Loading",posted:now-4*3600000,openings:3,dist:15.2,bearing:300,description:"Outside your 10 km radius, so this job is never shown to you."},
    {id:"job-109",title:"Restaurant Helper",employer:"Spice Route",pay:650,hours:"Evening shift",type:"Food service",skill:"Kitchen support",posted:now-6*3600000,openings:2,dist:22,bearing:20,description:"Outside your 10 km radius, so this job is never shown to you."}
  ];

  const defaultState = {
    openToWork:false, name:"Worker", phone:"", skills:"", workType:"Any suitable work", experience:"",
    jobAlerts:true, browserAlerts:false,
    applications:[
      {id:"app-201",jobId:"job-103",status:"Accepted",appliedAt:now-2*86400000},
      {id:"app-202",jobId:"job-101",status:"Under review",appliedAt:now-5*3600000},
      {id:"app-203",jobId:"job-102",status:"Applied",appliedAt:now-86400000}
    ],
    notifications:[
      {id:"note-1",title:"Application accepted",body:"Your application for Kitchen Helper has been accepted. Turn on Open to Work to view the workplace and start navigation.",time:now-2*3600000,read:false,kind:"accepted",jobId:"job-103"},
      {id:"note-2",title:"Application received",body:"Your application for Shop Helper has been submitted.",time:now-5*3600000,read:true,kind:"application",jobId:"job-101"},
      {id:"note-3",title:"Find work near you",body:"Turn on Open to Work and allow location to see jobs within 10 km.",time:now-86400000,read:true,kind:"jobs"}
    ],
    history:[{id:"hist-1",title:"One-day shop assistance",employer:"Sample Local Shop",date:"12 Oct 2026",amount:600,payment:"Paid"}]
  };

  let state = loadState();
  let map = null, markers = {}, routeLayer = null, workerMarker = null, radiusCircle = null;
  let navWatchId = null, locWatchId = null, toastTimer = null, appFilter = "all";
  let currentPosition = null;   // {lat,lng,accuracy} from the device
  let anchor = null;            // first fix; demo job coordinates are generated around it
  let lastRenderedPos = null, activeMapJobId = null, locating = false;

  function loadState(){
    try { const s = JSON.parse(localStorage.getItem(STORE) || "null"); return s ? {...structuredClone(defaultState), ...s} : structuredClone(defaultState); }
    catch { return structuredClone(defaultState); }
  }
  function saveState(){ try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} }
  function notify(msg){ const el=$("#toast"); el.textContent=msg; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),3200); }
  function timeAgo(t){ const m=Math.max(1,Math.floor((Date.now()-t)/60000)); if(m<60)return `${m} min ago`; const h=Math.floor(m/60); if(h<24)return `${h} hr ago`; const d=Math.floor(h/24); return `${d} day${d>1?"s":""} ago`; }
  function displayDate(t){ return new Date(t).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}); }

  // ---------- geo helpers ----------
  function haversine(a, b){
    const R=6371, rad=x=>x*Math.PI/180, dLat=rad(b.lat-a.lat), dLng=rad(b.lng-a.lng);
    const h=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;
    return 2*R*Math.asin(Math.sqrt(h));
  }
  function offsetPoint(origin, km, bearingDeg){
    const b=bearingDeg*Math.PI/180;
    const lat=origin.lat+(km*Math.cos(b))/111.32;
    const lng=origin.lng+(km*Math.sin(b))/(111.32*Math.cos(origin.lat*Math.PI/180));
    return {lat,lng};
  }
  // Jobs with coordinates and live distance from the device. Null until a location is known.
  function allJobs(){
    return demoJobs.map(j=>{
      if(!anchor||!currentPosition) return {...j,lat:null,lng:null,distance:null};
      const p=offsetPoint(anchor,j.dist,j.bearing);
      return {...j,lat:p.lat,lng:p.lng,distance:haversine(currentPosition,p)};
    });
  }
  const jobById = id => allJobs().find(j=>j.id===id);
  const inRange = j => j.distance!=null && j.distance<=RADIUS_KM;
  const isApplied = id => state.applications.some(a=>a.jobId===id);
  const canSeeJobs = () => state.openToWork && !!currentPosition;
  function nearbyJobs(){
    if(!canSeeJobs()) return [];
    const q=($("#jobSearch").value||"").trim().toLowerCase(), min=Number($("#payFilter").value||0), sort=$("#sortFilter").value;
    const jobs=allJobs().filter(j=>inRange(j)&&j.pay>=min&&(!q||[j.title,j.employer,j.skill,j.type].some(v=>v.toLowerCase().includes(q))));
    if(sort==="pay")jobs.sort((a,b)=>b.pay-a.pay); else if(sort==="recent")jobs.sort((a,b)=>b.posted-a.posted); else jobs.sort((a,b)=>a.distance-b.distance);
    return jobs;
  }
  function getPosition(){
    return new Promise(resolve=>{
      if(!("geolocation" in navigator)) return resolve({error:"unsupported"});
      navigator.geolocation.getCurrentPosition(
        p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy}),
        e=>resolve({error:e.code===1?"denied":e.code===3?"timeout":"unavailable"}),
        {enableHighAccuracy:true,timeout:15000,maximumAge:10000});
    });
  }
  function showLocationAlert(kind){
    const el=$("#locationAlert");
    const msgs={
      denied:"Location permission is required to go Open to Work. Allow location for this site (lock icon or Website Settings in the address bar; on Mac Safari also check System Settings > Privacy & Security > Location Services > Safari), then try again. Workers can't choose a work area manually.",
      unavailable:"We couldn't get your location. Check that GPS or Wi-Fi location is on and try again.",
      timeout:"Getting your location took too long. Move to an open area or check your connection, then try again.",
      unsupported:"This browser doesn't support location, so Open to Work can't be turned on here.",
      file:"This page is open as a local file (file://). Safari and many browsers never show the location prompt for local files, so it is blocked automatically. Run it from a local server instead: open Terminal in this folder, run  python3 -m http.server 8000  and visit http://localhost:8000/worker.html. Then allow location when the browser asks.",
      blocked:"Location sharing was turned off in the browser, so Open to Work was switched off."
    };
    if(!kind){ el.classList.add("hidden"); return; }
    el.textContent=msgs[kind]||msgs.unavailable; el.classList.remove("hidden");
  }

  // ---------- rendering ----------
  const iconFor = t => t==="Warehouse"?"📦":t==="Food service"?"🍳":t==="Cleaning"?"🧹":t==="Construction"?"🏗️":"💼";
  const statusBadge = s => `<span class="status-badge status-${esc(s.replace(/\s+/g,"-"))}">${esc(s)}</span>`;
  function emptyState(title,desc,btn,action){
    return `<div class="empty-state" style="grid-column:1/-1"><strong>${esc(title)}</strong><span>${esc(desc)}</span>${btn?`<div style="margin-top:16px"><button class="primary-button" data-action="${action}">${esc(btn)}</button></div>`:""}</div>`;
  }
  function jobCard(job){
    return `<article class="job-card"><div class="job-card-top"><div class="company-icon">${iconFor(job.type)}</div>
      <div style="min-width:0;flex:1"><h3>${esc(job.title)}</h3><div class="job-employer">${esc(job.employer)}</div></div>
      <div class="job-pay"><strong>${money(job.pay)}</strong><small>per day</small></div></div>
      <div class="job-meta"><span>📍 ${job.distance.toFixed(1)} km away</span><span>🕒 ${esc(job.hours)}</span><span>👤 ${job.openings} opening${job.openings===1?"":"s"}</span></div>
      <div class="job-tags"><span class="tag">${esc(job.skill)}</span><span class="tag">${esc(job.type)}</span></div>
      <div class="job-card-footer"><span class="posted-time">Posted ${timeAgo(job.posted)}</span><div style="display:flex;gap:7px"><button class="outline-button" data-action="preview" data-job="${job.id}">📍 Map</button><button class="primary-button" data-action="details" data-job="${job.id}">${isApplied(job.id)?"View status":"View job"}</button></div></div></article>`;
  }
  function renderJobs(){
    const open=canSeeJobs(), jobs=nearbyJobs();
    $("#statJobs").textContent=open?jobs.length:"—";
    $("#jobsCountPill").textContent=open?`${jobs.length} within ${RADIUS_KM} km`:"Hidden";
    $("#jobsGate").classList.toggle("hidden",open);
    $("#jobsList").classList.toggle("hidden",!open);
    $("#homeJobs").innerHTML=open?(jobs.length?jobs.slice(0,4).map(jobCard).join(""):emptyState(`No jobs within ${RADIUS_KM} km right now`,"New jobs near you will show up here and in your notifications.")):emptyState("Your job feed is paused","Turn on Open to Work and allow location to see jobs within 10 km.","Turn on Open to Work","enable-work");
    $("#jobsList").innerHTML=open?(jobs.length?jobs.map(jobCard).join(""):emptyState("No matching jobs within 10 km","Try another search, a lower pay filter, or check again later.")):"";
  }
  function renderApplications(){
    let apps=[...state.applications].sort((a,b)=>b.appliedAt-a.appliedAt);
    const filtered=appFilter==="all"?apps:apps.filter(a=>a.status===appFilter);
    $("#applicationsList").innerHTML=filtered.length?filtered.map(app=>{
      const job=demoJobs.find(j=>j.id===app.jobId); if(!job) return "";
      const act=app.status==="Accepted"?`<button class="primary-button" data-action="navigate" data-job="${job.id}">Navigate to workplace</button>`:`<button class="outline-button" data-action="details" data-job="${job.id}">View job</button>`;
      return `<article class="application-card"><div class="company-icon">${iconFor(job.type)}</div><div class="application-card-main"><h3>${esc(job.title)}</h3><p>${esc(job.employer)} · ${money(job.pay)}/day</p><p style="margin-top:5px">Applied ${displayDate(app.appliedAt)}</p></div>${statusBadge(app.status)}<div class="application-actions">${act}</div></article>`;
    }).join(""):emptyState("No applications here","Your applications with this status will appear here.");
    $("#homeApplications").innerHTML=apps.slice(0,3).map(app=>{
      const job=demoJobs.find(j=>j.id===app.jobId); if(!job) return "";
      return `<div class="activity-item"><div class="activity-mark">${app.status==="Accepted"?"✅":"💼"}</div><div class="activity-copy"><strong>${esc(job.title)}</strong><small>${esc(job.employer)} · ${displayDate(app.appliedAt)}</small></div>${statusBadge(app.status)}</div>`;
    }).join("")||`<p class="muted">Your applications will appear here.</p>`;
    $("#statApplications").textContent=state.applications.length; $("#applicationNavCount").textContent=state.applications.length;
  }
  function renderNotifications(){
    const unread=state.notifications.filter(n=>!n.read).length;
    $("#notificationNavCount").textContent=unread; $("#headerNotificationDot").classList.toggle("hidden",unread===0);
    $("#notificationsList").innerHTML=state.notifications.length?state.notifications.slice().sort((a,b)=>b.time-a.time).map(n=>{
      const job=demoJobs.find(j=>j.id===n.jobId);
      return `<article class="notification-card ${n.read?"":"unread"}"><div class="notification-symbol">${n.kind==="accepted"?"✅":n.kind==="jobs"?"📍":"💼"}</div><div class="notification-main"><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p><div class="notification-time" style="margin-top:7px">${timeAgo(n.time)}</div>${job?`<button class="text-button" data-action="${n.kind==="accepted"?"navigate":"details"}" data-job="${job.id}">${n.kind==="accepted"?"Navigate to workplace":"View job"} →</button>`:""}</div>${n.read?"":`<button class="text-button" data-action="read-notification" data-note="${n.id}">Mark read</button>`}</article>`;
    }).join(""):emptyState("You're all caught up","New job alerts and application updates will appear here.");
    $("#jobAlertsToggle").checked=state.jobAlerts;
  }
  function renderEarnings(){
    const total=state.history.reduce((s,h)=>s+Number(h.amount||0),0);
    $("#statEarnings").textContent=money(total); $("#earningsTotal").textContent=money(total);
    $("#historyList").innerHTML=state.history.length?state.history.map(h=>`<article class="history-card"><div class="company-icon">💰</div><div class="history-main"><h3>${esc(h.title)}</h3><p>${esc(h.employer)} · ${esc(h.date)}</p></div><div style="text-align:right"><strong style="display:block;color:var(--green);margin-bottom:5px">${money(h.amount)}</strong><span class="status-badge ${h.payment==="Paid"?"status-Accepted":"status-Under-review"}">${esc(h.payment)}</span></div></article>`).join(""):emptyState("No work history yet","Completed work and payment records will appear here.");
  }
  function renderProfile(){
    $("#profileName").value=state.name==="Worker"?"":state.name; $("#profilePhone").value=state.phone||"";
    $("#profileSkills").value=state.skills||""; $("#profileWorkType").value=state.workType||"Any suitable work"; $("#profileExperience").value=state.experience||"";
    const done=[state.name!=="Worker"&&state.name.trim(),state.phone,state.skills,state.workType!=="Any suitable work",state.experience].filter(Boolean).length;
    $("#profileCompletion").textContent=`Profile ${Math.round(done/5*100)}%`;
    const initial=(state.name||"W").trim().charAt(0).toUpperCase()||"W";
    ["#sidebarName","#topName","#welcomeName"].forEach(s=>$(s).textContent=state.name);
    ["#sidebarAvatar","#topAvatar","#profileAvatar"].forEach(s=>$(s).textContent=initial);
  }
  function renderAvailability(){
    const on=state.openToWork&&!!currentPosition;
    $("#availabilityToggle").checked=on; $("#availabilityToggle").disabled=locating;
    $("#availabilityTitle").textContent=locating?"Checking your location…":on?"You're open to work":"You're currently offline";
    $("#availabilityDescription").textContent=locating?"Please allow location when your browser asks.":on?`Showing jobs within ${RADIUS_KM} km of your current location.`:"Turn on Open to Work and allow location to see jobs within 10 km.";
    $("#sidebarAvailability").textContent=on?"Open to work":"Open to work is OFF";
    const pill=$(".location-pill"); pill.classList.toggle("on",on);
    $("#locationLabel").textContent=on?`Using device location · ${RADIUS_KM} km radius`:"Location off · enable Open to Work";
    $("#refreshLocation").classList.toggle("hidden",!on);
  }
  function renderAll(){ renderAvailability(); renderProfile(); renderJobs(); renderApplications(); renderNotifications(); renderEarnings(); }

  function showView(view){
    const target=$("#view-"+view); if(!target) return;
    $$(".view").forEach(el=>el.classList.toggle("active",el===target));
    $$("[data-view]").forEach(el=>el.classList.toggle("active",el.dataset.view===view));
    const names={home:"Dashboard",jobs:"Nearby jobs",applications:"My applications",map:"Map view",earnings:"Earnings & history",notifications:"Notifications",profile:"Worker profile",verification:"Identity verification"};
    $("#pageCrumb").textContent=names[view]||"Dashboard";
    if(view==="map") setTimeout(()=>{ initMap(); if(map) map.invalidateSize(); refreshMap(); },80);
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function addNotification(title,body,kind="application",jobId=null){
    if(state.notifications.some(n=>n.title===title&&n.jobId===jobId&&Date.now()-n.time<6*3600000)) return;
    state.notifications.unshift({id:"note-"+Date.now()+Math.random().toString(36).slice(2,6),title,body,kind,jobId,time:Date.now(),read:false});
    if(state.browserAlerts&&"Notification" in window&&Notification.permission==="granted"){ try{ new Notification(title,{body,tag:jobId||title}); }catch{} }
  }

  // ---------- availability + location ----------
  async function goOpenToWork(){
    if(locating) return;
    locating=true; showLocationAlert(null); renderAvailability();
    const pos=await getPosition();
    locating=false;
    if(pos.error){
      state.openToWork=false; currentPosition=null; saveState(); renderAll(); showLocationAlert(location.protocol==="file:"&&pos.error!=="unsupported"?"file":pos.error);
      notify("Open to Work needs your device location."); return;
    }
    currentPosition=pos; if(!anchor) anchor=pos; state.openToWork=true; saveState();
    startLocationWatch(); lastRenderedPos=pos; renderAll(); refreshMap();
    const count=nearbyJobs().length;
    notify(`You're open to work. ${count} job${count===1?"":"s"} within ${RADIUS_KM} km.`);
    if(state.jobAlerts&&count>0) { addNotification("Jobs near you",`${count} job${count===1?" is":"s are"} available within ${RADIUS_KM} km of your location.`,"jobs"); saveState(); renderNotifications(); }
  }
  function goOffline(silent){
    state.openToWork=false; currentPosition=null; lastRenderedPos=null; stopLocationWatch(); stopNavigation();
    saveState(); renderAll(); refreshMap();
    if(!silent) notify("Open to Work is off. Job discovery and location tracking are paused.");
  }
  function startLocationWatch(){
    if(locWatchId!==null||!("geolocation" in navigator)) return;
    locWatchId=navigator.geolocation.watchPosition(p=>{
      currentPosition={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy};
      if(workerMarker) workerMarker.setLatLng([currentPosition.lat,currentPosition.lng]);
      if(!lastRenderedPos||haversine(lastRenderedPos,currentPosition)>=MOVE_REFRESH_KM){
        lastRenderedPos=currentPosition; renderJobs(); refreshMap(); renderAvailability();
      }
    },err=>{
      if(err.code===1){ goOffline(true); showLocationAlert("blocked"); notify("Location was turned off, so Open to Work is now off."); }
    },{enableHighAccuracy:true,maximumAge:8000,timeout:20000});
  }
  function stopLocationWatch(){ if(locWatchId!==null&&navigator.geolocation){ navigator.geolocation.clearWatch(locWatchId); locWatchId=null; } }

  async function refreshLocation(){
    const pos=await getPosition();
    if(pos.error){ notify("Couldn't refresh your location."); return; }
    currentPosition=pos; lastRenderedPos=pos; renderAll(); refreshMap(); notify("Location refreshed.");
  }

  function applyToJob(id){
    if(!canSeeJobs()){ notify("Turn on Open to Work (with location) before applying."); return; }
    if(isApplied(id)){ notify("You've already applied for this job."); return; }
    const job=jobById(id); if(!job) return;
    if(!inRange(job)){ notify(`This job is outside your ${RADIUS_KM} km radius.`); return; }
    state.applications.unshift({id:"app-"+Date.now(),jobId:id,status:"Applied",appliedAt:Date.now()});
    addNotification("Application submitted",`Your application for ${job.title} has been submitted.`,"application",id);
    saveState(); renderAll(); $("#jobDialog").close(); notify("Application submitted.");
  }
  function showJobDetails(id){
    const job=jobById(id); if(!job) return;
    const app=state.applications.find(a=>a.jobId===id), accepted=app?.status==="Accepted";
    const dist=job.distance!=null?`${job.distance.toFixed(1)} km away`:"Distance shown once location is on";
    let action;
    if(accepted) action=`<button class="primary-button" data-action="navigate" data-job="${job.id}">Navigate</button>`;
    else if(app) action=`<button class="outline-button" disabled>${esc(app.status)}</button>`;
    else if(!canSeeJobs()) action=`<button class="primary-button" data-action="enable-work">Turn on Open to Work</button>`;
    else action=`<button class="primary-button" data-action="apply" data-job="${job.id}">Apply for this job</button>`;
    $("#jobDialogContent").innerHTML=`<p class="eyebrow">${esc(job.type.toUpperCase())}</p><h2>${esc(job.title)}</h2><p class="muted">${esc(job.employer)}</p>
      <div style="font-weight:800;font-size:24px;color:var(--orange);margin-top:17px">${money(job.pay)} <span style="font-size:12px;font-weight:500;color:var(--muted)">per day</span></div>
      <div class="job-meta"><span>📍 ${esc(dist)}</span><span>🕒 ${esc(job.hours)}</span><span>👤 ${job.openings} opening(s)</span></div>
      <h3>About this work</h3><p class="muted">${esc(job.description)}</p>
      <div class="map-detail-row"><span>📍</span><div><strong>Workplace</strong><small>Exact address should be confirmed by the employer</small></div></div>
      <div class="map-detail-row"><span>💰</span><div><strong>Pay</strong><small>${money(job.pay)} per day · confirm payment terms before accepting work</small></div></div>
      <div class="dialog-actions"><button class="outline-button" data-action="preview" data-job="${job.id}">Preview on map</button>${action}</div>`;
    $("#jobDialog").showModal();
  }

  // ---------- map ----------
  function initMap(){
    if(map||!window.L) return;
    map=L.map("map",{zoomControl:true}).setView([20.5937,78.9629],5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap contributors"}).addTo(map);
  }
  window.workkaroPreviewJob=id=>{ activeMapJobId=id; renderMapSide(id); };
  function refreshMap(){
    if(!map) return;
    Object.values(markers).forEach(m=>m.remove()); markers={};
    if(radiusCircle){ radiusCircle.remove(); radiusCircle=null; }
    if(workerMarker){ workerMarker.remove(); workerMarker=null; }
    if(!canSeeJobs()){
      $("#mapNotice").textContent="Turn on Open to Work to see jobs around you.";
      $("#mapPrimaryAction").classList.add("hidden"); $("#googleMapsButton").classList.add("hidden"); return;
    }
    radiusCircle=L.circle([currentPosition.lat,currentPosition.lng],{radius:RADIUS_KM*1000,color:"#ea7b34",weight:1.5,fillColor:"#ea7b34",fillOpacity:.06,dashArray:"6 6"}).addTo(map);
    workerMarker=L.circleMarker([currentPosition.lat,currentPosition.lng],{radius:9,color:"#fff",weight:3,fillColor:"#ea7b34",fillOpacity:1}).addTo(map).bindPopup("You are here");
    const pts=[[currentPosition.lat,currentPosition.lng]];
    const visible=new Set(nearbyJobs().map(j=>j.id));
    state.applications.filter(a=>a.status==="Accepted").forEach(a=>{ const j=jobById(a.jobId); if(j&&inRange(j)) visible.add(j.id); });
    allJobs().filter(j=>visible.has(j.id)).forEach(job=>{
      const m=L.marker([job.lat,job.lng]).addTo(map).bindPopup(`<strong>${esc(job.title)}</strong><br>${job.distance.toFixed(1)} km · ${money(job.pay)}/day<br><button onclick="window.workkaroPreviewJob('${job.id}')">Preview job</button>`);
      m.on("click",()=>{ activeMapJobId=job.id; renderMapSide(job.id); });
      markers[job.id]=m; pts.push([job.lat,job.lng]);
    });
    map.fitBounds(L.latLngBounds(pts).pad(.2),{maxZoom:15});
    if(activeMapJobId&&markers[activeMapJobId]) renderMapSide(activeMapJobId);
    else $("#mapNotice").textContent=`Showing jobs within ${RADIUS_KM} km. Select a pin to preview.`;
  }
  function renderMapSide(id){
    const job=jobById(id); if(!job||!canSeeJobs()) return;
    activeMapJobId=id;
    if(map&&markers[id]) map.panTo([job.lat,job.lng]);
    const app=state.applications.find(a=>a.jobId===id), accepted=app?.status==="Accepted";
    $("#mapSideTitle").textContent=job.title; $("#mapSideSubtitle").textContent=job.employer;
    $("#mapJobDetails").innerHTML=`<div class="map-detail-row"><span>↔</span><div><strong>Distance from you</strong><small>${job.distance.toFixed(1)} km (straight line, demo data)</small></div></div><div class="map-detail-row"><span>💰</span><div><strong>Daily pay</strong><small>${money(job.pay)} per day</small></div></div><div class="map-detail-row"><span>🕒</span><div><strong>Working time</strong><small>${esc(job.hours)}</small></div></div>`;
    const btn=$("#mapPrimaryAction"); btn.classList.remove("hidden");
    btn.textContent=accepted?"Navigate to workplace":app?"View application":"View job"; btn.dataset.action=accepted?"navigate":"details"; btn.dataset.job=id;
    $("#googleMapsButton").classList.remove("hidden"); $("#googleMapsButton").onclick=()=>openGoogleMaps(job);
    $("#mapNotice").textContent=accepted?"Accepted job selected. Start live navigation when ready.":"Workplace preview. Live navigation is available after acceptance.";
  }
  function openGoogleMaps(job){
    if(job.lat==null) return;
    const dest=`${job.lat},${job.lng}`, o=currentPosition?`&origin=${encodeURIComponent(currentPosition.lat+","+currentPosition.lng)}`:"";
    window.open(`https://www.google.com/maps/dir/?api=1${o}&destination=${encodeURIComponent(dest)}&travelmode=driving`,"_blank","noopener,noreferrer");
  }
  async function startNavigation(id){
    const app=state.applications.find(a=>a.jobId===id);
    if(!app||app.status!=="Accepted"){ notify("Navigation is available after the employer accepts your application."); return; }
    if(!canSeeJobs()){ notify("Turn on Open to Work (with location) to navigate to the workplace."); showView("home"); return; }
    const job=jobById(id); if(!job) return;
    if(!inRange(job)){ notify(`This workplace is outside your ${RADIUS_KM} km radius.`); return; }
    showView("map"); activeMapJobId=id;
    setTimeout(async()=>{
      initMap(); refreshMap(); renderMapSide(id);
      if(routeLayer){ routeLayer.remove(); routeLayer=null; }
      $("#mapNotice").textContent="Getting route…";
      try{
        const r=await fetch(`https://router.project-osrm.org/route/v1/driving/${currentPosition.lng},${currentPosition.lat};${job.lng},${job.lat}?overview=full&geometries=geojson`);
        if(!r.ok) throw new Error(); const data=await r.json(); if(!data.routes?.length) throw new Error();
        const route=data.routes[0];
        routeLayer=L.polyline(route.geometry.coordinates.map(c=>[c[1],c[0]]),{color:"#ea7b34",weight:5,opacity:.9}).addTo(map);
        map.fitBounds(routeLayer.getBounds().pad(.15));
        const km=(route.distance/1000).toFixed(1), mins=Math.round(route.duration/60);
        $("#mapNotice").textContent=`Route ready · ${km} km · about ${mins} min (estimate; traffic may differ).`;
        $("#mapJobDetails").insertAdjacentHTML("beforeend",`<div class="map-detail-row"><span>➤</span><div><strong>Route estimate</strong><small>${km} km · about ${mins} minutes</small></div></div>`);
        notify("Navigation started.");
      }catch{
        $("#mapNotice").textContent="In-app route couldn't load (demo routing may be unavailable or the demo workplace isn't on a road). Use Google Maps for directions.";
      }
    },120);
  }
  function stopNavigation(){ if(routeLayer&&map){ routeLayer.remove(); routeLayer=null; } }

  function handleAction(action,el){
    const id=el.dataset.job;
    if(action==="details") showJobDetails(id);
    else if(action==="preview"){
      if(!canSeeJobs()){ notify("Turn on Open to Work to see workplaces on the map."); if($("#jobDialog").open) $("#jobDialog").close(); return; }
      activeMapJobId=id; if($("#jobDialog").open) $("#jobDialog").close(); showView("map"); setTimeout(()=>renderMapSide(id),160);
    }
    else if(action==="apply") applyToJob(id);
    else if(action==="navigate"){ if($("#jobDialog").open) $("#jobDialog").close(); startNavigation(id); }
    else if(action==="enable-work"){ if($("#jobDialog").open) $("#jobDialog").close(); goOpenToWork().then(()=>{ if(canSeeJobs()) showView("jobs"); }); }
    else if(action==="read-notification"){ const n=state.notifications.find(n=>n.id===el.dataset.note); if(n) n.read=true; saveState(); renderNotifications(); }
  }

  // ---------- events ----------
  document.addEventListener("click",e=>{
    const v=e.target.closest("[data-view]"); if(v){ e.preventDefault(); showView(v.dataset.view); return; }
    const a=e.target.closest("[data-action]"); if(a) handleAction(a.dataset.action,a);
  });
  $("#availabilityToggle").addEventListener("change",e=>{ e.target.checked?goOpenToWork():goOffline(); });
  $("#jobsGateButton").addEventListener("click",goOpenToWork);
  $("#refreshLocation").addEventListener("click",refreshLocation);
  $("#headerNotifications").addEventListener("click",()=>showView("notifications"));
  $("#jobSearch").addEventListener("input",renderJobs);
  $("#payFilter").addEventListener("change",renderJobs);
  $("#sortFilter").addEventListener("change",renderJobs);
  $("#applicationTabs").addEventListener("click",e=>{ const b=e.target.closest("button[data-status]"); if(!b) return; appFilter=b.dataset.status; $$("#applicationTabs button").forEach(x=>x.classList.toggle("selected",x===b)); renderApplications(); });
  $("#profileForm").addEventListener("submit",e=>{
    e.preventDefault(); state.name=$("#profileName").value.trim()||"Worker"; state.phone=$("#profilePhone").value.trim(); state.skills=$("#profileSkills").value.trim();
    state.workType=$("#profileWorkType").value; state.experience=$("#profileExperience").value.trim(); saveState(); renderAll(); notify("Profile saved on this device.");
  });
  $("#jobAlertsToggle").addEventListener("change",e=>{ state.jobAlerts=e.target.checked; saveState(); notify(state.jobAlerts?"Job alerts enabled.":"Job alerts paused."); });
  $("#browserPermissionButton").addEventListener("click",async()=>{
    if(!("Notification" in window)){ notify("Browser notifications aren't supported here."); return; }
    try{ const p=await Notification.requestPermission(); state.browserAlerts=p==="granted"; saveState(); $("#browserPermissionButton").textContent=state.browserAlerts?"Browser alerts enabled":p==="denied"?"Permission denied":"Enable browser alerts"; notify(state.browserAlerts?"Browser notifications enabled.":"Browser notifications weren't enabled."); }
    catch{ notify("Couldn't request notification permission."); }
  });
  $("#markAllRead").addEventListener("click",()=>{ state.notifications.forEach(n=>n.read=true); saveState(); renderNotifications(); notify("All notifications marked as read."); });
  $("#verificationInfoButton").addEventListener("click",()=>$("#verificationDialog").showModal());
  ["#verificationDialog","#jobDialog"].forEach(s=>$(s).addEventListener("click",e=>{ if(e.target===e.currentTarget) e.currentTarget.close(); }));
  window.addEventListener("beforeunload",()=>{ stopLocationWatch(); stopNavigation(); });

  // ---------- init ----------
  $("#todayLabel").textContent=new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"}).toUpperCase();
  const wasOpen=state.openToWork;
  state.openToWork=false;   // never trust a saved "open" flag: location must be confirmed again each visit
  renderAll();
  if(wasOpen){ goOpenToWork(); }
})();
