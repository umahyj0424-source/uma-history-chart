/* UMA RACE ATLAS · portable GitHub Pages edition. No runtime dependencies. */
(() => {
  'use strict';
  const baseline = window.UMA_SEED;
  if (!baseline || !Array.isArray(baseline.horses) || !Array.isArray(baseline.events)) {
    document.body.textContent = 'seed.js를 찾을 수 없습니다. ZIP 파일 전체를 함께 업로드해 주세요.';
    return;
  }
  const STORAGE_KEY = 'uma-race-atlas-portable-edits-v1';
  const KINDS = {horse:'horses',event:'events',race:'races',variant:'variants'};
  const LABELS = {horse:'경주마',event:'경기',race:'출전 기록',variant:'의상'};
  const KEYS = {horse:'horse_id',event:'event_id',race:'race_id',variant:'variant_id'};
  const COLORS = ['#d78052','#4b9c9c','#6875b5','#d2a44d','#7ba374','#b67eaa','#7499bb','#b59a63','#bc6d75','#659a7e'];
  const PRESETS = {
    golden:{year:1998,names:['스페셜위크','그래스원더','세이운스카이','킹헤일로','엘콘도르파사','사일런스스즈카']},
    classic:{year:2012,names:['골드쉽','젠틸돈나','페노메노','오르페브르','윈바리아시옹']},
    recent:{year:2018,names:['아몬드아이','럭키라일락','그란알레그리아','러브즈온리유','크로노제네시스']}
  };
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uri = value => { const s=String(value||'').trim(); return /^(https?:\/\/|\.\.?\/|data:image\/(png|jpeg|webp|gif);base64,)/i.test(s)?esc(s):''; };
  const eventName = e => e.race_name_ko || e.race_name_ja || '이름 없는 경기';
  const color = h => COLORS[((h.horse_index||1)-1)%COLORS.length];
  const yearOf = date => Number((date||'').slice(0,4));
  const time = date => Date.parse(`${date}T00:00:00Z`);
  const iso = date => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(time(date)) && new Date(time(date)).toISOString().slice(0,10)===date;
  const datestr = d => String(d||'').replaceAll('-','.');
  const cancelled = r => /取消|除外|취소|제외/.test(r.result_status||'');
  const fmt = n => Number(n).toLocaleString('ko-KR');
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const idFor = (kind,r) => String(r[KEYS[kind]]);
  const newId = kind => ({horse:'horse_custom_',event:'E_MAN_',race:'R_MAN_',variant:'V_MAN_'})[kind]+Date.now().toString(36)+Math.random().toString(36).slice(2,8);

  let edits = new Map();
  try {for(const e of JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'))if(KINDS[e.kind]&&e.id)edits.set(`${e.kind}:${e.id}`,e);} catch(err) {console.warn('Stored data could not be loaded',err);}
  let data;
  let byHorse, byEvent, startsByHorse;
  let selected = new Set(baseline.horses.map(h=>h.horse_id));
  let selectedCustom = false;
  let period = '2', startYear = 1998, zoom = 1;
  let view = 'timeline', detailKind = '', detailId = '';
  let kind = 'horse', page = 0, search = '';
  let draft = null, editingKind = '', editingNew = false;
  let toastTimer;

  function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
  function rebuild(){
    data={meta:baseline.meta, horses:[...baseline.horses],events:[...baseline.events],races:[...baseline.races],variants:[...baseline.variants]};
    for(const e of edits.values()){
      const rows=data[KINDS[e.kind]], ix=rows.findIndex(r=>idFor(e.kind,r)===e.id);
      if(e.operation==='delete'){if(ix>=0)rows.splice(ix,1);}
      else if(e.record){if(ix>=0)rows[ix]=e.record;else rows.push(e.record);}
    }
    const hset=new Set(data.horses.map(h=>h.horse_id)), eset=new Set(data.events.map(e=>e.event_id));
    data.races=data.races.filter(r=>hset.has(r.horse_id)&&eset.has(r.event_id));
    data.variants=data.variants.filter(v=>hset.has(v.horse_id));
    data.horses.sort((a,b)=>a.horse_index-b.horse_index);
    data.events.sort((a,b)=>a.date.localeCompare(b.date));
    data.races.sort((a,b)=>a.date.localeCompare(b.date));
    data.variants.sort((a,b)=>a.variant_no-b.variant_no);
    byHorse=new Map(data.horses.map(h=>[h.horse_id,h]));
    byEvent=new Map(data.events.map(e=>[e.event_id,e]));
    startsByHorse=new Map(data.horses.map(h=>[h.horse_id,[]]));
    for(const r of data.races){if(startsByHorse.has(r.horse_id)&&!cancelled(r))startsByHorse.get(r.horse_id).push(r);}
    if(!selectedCustom)selected=new Set(data.horses.map(h=>h.horse_id));
    else selected=new Set([...selected].filter(id=>byHorse.has(id)));
  }
  function persist(changes){
    const next = new Map(edits);
    for(const e of changes)next.set(`${e.kind}:${e.id}`,e);
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify([...next.values()]));edits=next;rebuild();render();return true;}
    catch(err){console.warn(err);notify('브라우저 저장 공간이 부족합니다. JSON으로 백업하고 이미지 크기를 줄여 주세요.');return false;}
  }
  function saveRecord(k,r){return persist([{kind:k,id:idFor(k,r),operation:'upsert',record:r}]);}
  function bounds(){const ys=data.events.map(e=>yearOf(e.date)).filter(y=>y>=1800&&y<=2200);return {min:Math.min(...ys,1976),max:Math.max(...ys,2021)};}
  function currentRange(){const b=bounds(),first=period==='all'?b.min:startYear,years=period==='all'?b.max-b.min+1:Number(period);return {start:first,years,end:first+years,begin:`${first}-01-01`,finish:`${first+years}-01-01`};}
  function setView(next){view=next;$('timelineView').hidden=next!=='timeline';$('manageView').hidden=next!=='manage';$('navTimeline').classList.toggle('active',next==='timeline');$('navManage').classList.toggle('active',next==='manage');$('detail').hidden=true;if(next==='manage')renderManagement();else renderTimeline();window.scrollTo({top:0,behavior:'auto'});}
  function render(){
    $('statHorses').textContent=fmt(data.horses.length);$('statEvents').textContent=fmt(data.events.length);$('statStarts').textContent=fmt(data.races.length);
    const counts=new Map();for(const r of data.races)if(!cancelled(r))counts.set(r.event_id,(counts.get(r.event_id)||0)+1);
    $('statShared').textContent=fmt([...counts.values()].filter(n=>n>=2).length);
    $('countHorse').textContent=fmt(data.horses.length);$('countEvent').textContent=fmt(data.events.length);$('countRace').textContent=fmt(data.races.length);$('countVariant').textContent=fmt(data.variants.length);
    $('selectedCount').textContent=`${fmt(selected.size)} / ${fmt(data.horses.length)}`;
    renderHorseList();if(view==='timeline')renderTimeline();else renderManagement();
    if(detailId)renderDetail();
  }
  function renderHorseList(){
    const q=$('horseSearch').value.trim().toLowerCase();
    $('horseList').innerHTML=data.horses.filter(h=>`${h.name_ko} ${h.name_ja}`.toLowerCase().includes(q)).map(h=>`<button class="horse-entry ${selected.has(h.horse_id)?'chosen':''}" data-id="${esc(h.horse_id)}"><span class="horse-photo">${uri(h.portrait_url)?`<img src="${uri(h.portrait_url)}" alt=""/>`:'▧'}</span><span class="horse-names"><b>${esc(h.name_ko)}</b><small>${esc(h.name_ja)}</small></span><span class="tick">${selected.has(h.horse_id)?'✓':'+'}</span></button>`).join('');
  }

  function renderTimeline(){
    const range=currentRange(), visible=data.horses.filter(h=>selected.has(h.horse_id));
    $('periodTitle').textContent=`${range.start} — ${range.end-1}`;
    $('startYear').value=range.start;$('startYear').disabled=period==='all';$('prevYear').disabled=period==='all';$('nextYear').disabled=period==='all';$('period').value=period;
    const labels=$('labelsScroll'),tracks=$('tracksScroll'),leftTop=labels.scrollTop,top=tracks.scrollTop,left=tracks.scrollLeft;
    const step=visible.length>60?72:visible.length>20?88:110;
    const topHeight=112,origin=topHeight+step/2;
    $('trackLabels').innerHTML=visible.map(h=>`<button class="track-label" style="--lane-height:${step}px" data-id="${esc(h.horse_id)}"><i class="lane-bar" style="background:${color(h)}"></i><span class="small-photo">${uri(h.portrait_url)?`<img alt="" src="${uri(h.portrait_url)}"/>`:'▧'}</span><span class="label-details"><b>${esc(h.name_ko)}</b><small>${startsByHorse.get(h.horse_id)?.length||0}전 · ${h.last_race_confirmed?'최종전 확인':'보완 중'}</small></span></button>`).join('');
    const svg=$('raceSvg');
    if(!visible.length){svg.setAttribute('width',700);svg.setAttribute('height',390);svg.innerHTML='<rect width="700" height="390" fill="#f5f8f3"/><text x="85" y="185" fill="#86a18c" font-size="19">경주마를 선택해 주세요.</text>';$('trackLabels').innerHTML='';return;}
    const days=(time(range.finish)-time(range.begin))/86400000,unit=Math.min(2.7*zoom,22000/days);
    const width=Math.ceil(days*unit+148),height=topHeight+visible.length*step+45;
    const xOf=d=>70+(time(d)-time(range.begin))/86400000*unit;
    const portraitLead=46; // keep the portrait left of its first dated result
    const ix=new Map(visible.map((h,i)=>[h.horse_id,i]));
    const shared=new Map();
    for(const r of data.races){const n=ix.get(r.horse_id);if(n===undefined||r.date<range.begin||r.date>=range.finish||cancelled(r))continue;const e=byEvent.get(r.event_id);if(!e)continue;if(!shared.has(e.event_id))shared.set(e.event_id,{event:e,indices:[]});shared.get(e.event_id).indices.push(n);}
    const strokes=[];const monthCount=range.years*12;
    const months=[];for(let n=0;n<monthCount;n++){
      const y=range.start+Math.floor(n/12),m=n%12+1,d=`${y}-${String(m).padStart(2,'0')}-01`,x=xOf(d),major=m===1,monthSpacing=30*unit;
      const line=major||monthSpacing>=20||m%3===1,label=major||monthSpacing>=38||(monthSpacing>=12&&m%3===1);
      months.push(`${line?`<line x1="${x}" x2="${x}" y1="49" y2="${height}" stroke="${major?'#a1baa6':'#d9e6da'}" stroke-dasharray="${major?'':'3 7'}"/>`:''}${label?`<text x="${x+8}" y="${major?34:75}" font-size="${major?19:11}" font-weight="${major?800:600}" fill="${major?'#315f47':'#7f9c84'}">${major?y:`${m}월`}</text>`:''}`);
    }
    for(let i=0;i<visible.length;i++){
      const h=visible[i],y=origin+i*step,records=startsByHorse.get(h.horse_id)||[],first=records[0]?.date,last=records.at(-1)?.date;
      const active=first&&last&&first<range.finish&&last>=range.begin;
      let content=`<rect x="0" y="${y-step/2}" width="${width}" height="${step}" fill="${i%2===0?'#fff':'#f4f8f2'}" opacity=".7"/><line x1="0" x2="${width}" y1="${y+step/2}" y2="${y+step/2}" stroke="#e3ece0"/>`;
      if(active){const a=Math.max(70,xOf(first)),b=Math.max(a,Math.min(xOf(last),xOf(range.finish)-12));
        const startsHere=first>=range.begin,portraitX=a-portraitLead;
        content+=`<line x1="${startsHere?portraitX:a}" x2="${b}" y1="${y}" y2="${y}" stroke="${color(h)}" stroke-width="5" stroke-linecap="round"/>`;
        if(startsHere){content+=`<g class="horse-start-portrait"><circle cx="${portraitX}" cy="${y}" r="23" fill="#fff" stroke="${color(h)}" stroke-width="3"/><circle cx="${portraitX}" cy="${y}" r="18" fill="#f1f7ef" stroke="#b6cdbb" stroke-dasharray="3 3"/>`;
          if(uri(h.portrait_url)){content+=`<defs><clipPath id="p-${i}"><circle cx="${portraitX}" cy="${y}" r="18"/></clipPath></defs><image href="${uri(h.portrait_url)}" x="${portraitX-18}" y="${y-18}" width="36" height="36" preserveAspectRatio="xMidYMid slice" clip-path="url(#p-${i})"/>`;}
          else content+=`<text x="${portraitX}" y="${y+5}" text-anchor="middle" font-size="16" fill="#9fb7a6">+</text>`;
          content+='</g>';
        }
        if(last<range.finish){content+=`<circle cx="${b}" cy="${y}" r="10" fill="${color(h)}" stroke="#fff" stroke-width="3"/><rect x="${b-10}" y="${y-step/2+2}" width="72" height="16" rx="8" fill="${h.last_race_confirmed?'#1d5d45':'#897656'}"/><text x="${b+26}" y="${y-step/2+13}" text-anchor="middle" fill="#fff" font-size="9" font-weight="700">${h.last_race_confirmed?'최종 출전':'마지막 확인'}</text>`;}
      }else content+=`<text x="90" y="${y+4}" font-size="11" fill="#a8b9aa">선택 기간에 출전 기록 없음</text>`;
      strokes.push(content);
    }
    const connectors=[];for(const {event,indices} of shared.values())if(indices.length>=2){const x=xOf(event.date),min=Math.min(...indices),max=Math.max(...indices);connectors.push(`<line x1="${x}" x2="${x}" y1="${origin+min*step}" y2="${origin+max*step}" stroke="#217c72" stroke-width="3" stroke-dasharray="5 5" opacity=".7"/>`);}
    const dots=[];for(const r of data.races){const i=ix.get(r.horse_id);if(i===undefined||r.date<range.begin||r.date>=range.finish||cancelled(r))continue;const e=byEvent.get(r.event_id);if(!e)continue;const x=xOf(e.date),y=origin+i*step,big=/^G[ⅠI1]|^Jpn[ⅠI1]/i.test(e.grade||'');dots.push(`<g class="race-node" data-event="${esc(e.event_id)}" role="button" tabindex="0" aria-label="${esc(`${datestr(e.date)} ${eventName(e)} ${r.finish??''}착`)}"><circle cx="${x}" cy="${y}" r="${big?11:9}" fill="#fff" stroke="${color(visible[i])}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="3" fill="${big?'#cca156':color(visible[i])}"/><circle cx="${x}" cy="${y}" r="19" fill="transparent"/></g>`);}
    svg.setAttribute('width',width);svg.setAttribute('height',height);
    svg.innerHTML=`<rect width="${width}" height="${height}" fill="#f8faf6"/><rect width="${width}" height="${topHeight}" fill="#edf4e9"/>${months.join('')}<line x1="0" x2="${width}" y1="${topHeight}" y2="${topHeight}" stroke="#cbdcc9"/><text x="70" y="100" font-size="10" fill="#87a18b">실제 일수 비례 · 공동 출전은 같은 경기 지점으로 연결</text>${strokes.join('')}${connectors.join('')}${dots.join('')}`;
    labels.scrollTop=Math.min(leftTop,labels.scrollHeight);tracks.scrollTop=Math.min(top,tracks.scrollHeight);tracks.scrollLeft=Math.min(left,tracks.scrollWidth);
  }

  function renderDetail(){
    const el=$('detail');let html='';
    if(detailKind==='event'){
      const e=byEvent.get(detailId);if(!e){el.hidden=true;return;}
      const records=data.races.filter(r=>r.event_id===e.event_id).sort((a,b)=>(a.finish??999)-(b.finish??999));
      html=`<div class="detail-top"><span class="eyebrow">RACE DETAIL / EVENT</span><button data-close="1" title="닫기">×</button></div><div class="photo-slot detail-photo">${uri(e.image_url)?`<img src="${uri(e.image_url)}" alt="${esc(eventName(e))}"/>`:'<span>▧</span>경기 이미지 추가 예정'}</div><p class="detail-info">${esc(datestr(e.date))} · ${esc(e.venue_ja)}</p><h2>${esc(eventName(e))}</h2><p>${esc(e.grade||'일반')} · ${esc(e.surface_ja)} ${e.distance_m?`· ${esc(e.distance_m)}m`:''}</p><h3>함께 달린 경주마 · ${records.length}</h3>${records.map(r=>`<button class="participant" style="width:100%;background:none;border:0;border-bottom:1px solid #edf2e8;text-align:left" data-horse="${esc(r.horse_id)}"><span class="rank">${esc(r.finish?`${r.finish}착`:r.result_status||'—')}</span><span><b>${esc(byHorse.get(r.horse_id)?.name_ko||r.horse_id)}</b><small>${esc(r.jockey_ja||'기수 미기재')}</small></span></button>`).join('')}`;
    }else{
      const h=byHorse.get(detailId);if(!h){el.hidden=true;return;}const records=startsByHorse.get(h.horse_id)||[];
      html=`<div class="detail-top"><span class="eyebrow">RACE DETAIL / HORSE</span><button data-close="1">×</button></div><div class="detail-avatar">${uri(h.portrait_url)?`<img src="${uri(h.portrait_url)}" alt=""/>`:'<span style="font-size:25px">▧</span>'}</div><h2>${esc(h.name_ko)}</h2><p>${esc(h.name_ja)} · ${records.length}전 · ${records.filter(r=>r.finish===1).length}승</p><h3>최근 출전 기록</h3>${records.slice(-12).reverse().map(r=>`<button class="participant" style="width:100%;background:none;border:0;border-bottom:1px solid #edf2e8;text-align:left" data-event="${esc(r.event_id)}"><span class="rank">${esc(r.finish?`${r.finish}착`:r.result_status||'—')}</span><span><b>${esc(eventName(byEvent.get(r.event_id)||{}))}</b><small>${esc(datestr(r.date))}</small></span></button>`).join('')}`;
    }
    el.innerHTML=html;el.hidden=false;
  }

  function renderManagement(){
    document.querySelectorAll('[data-kind]').forEach(button=>button.classList.toggle('active',button.dataset.kind===kind));
    $('kindTitle').textContent=LABELS[kind]+' 데이터';$('kindCaption').textContent='EDIT / '+kind.toUpperCase();
    const q=search.trim().toLowerCase();
    const list=data[KINDS[kind]].filter(r=>{
      if(!q)return true;
      const link=kind==='race'?`${byHorse.get(r.horse_id)?.name_ko||''} ${eventName(byEvent.get(r.event_id)||{})}`:'';
      return (Object.values(r).join(' ')+' '+link).toLowerCase().includes(q);
    });
    const pages=Math.max(1,Math.ceil(list.length/20));page=Math.min(page,pages-1);
    $('recordCount').textContent=`총 ${fmt(list.length)}건 · ${page+1}/${pages} 페이지`;
    $('pagePrev').disabled=page===0;$('pageNext').disabled=page>=pages-1;
    $('recordsBody').innerHTML=list.slice(page*20,page*20+20).map(r=>{
      const id=idFor(kind,r),title=kind==='horse'?r.name_ko:kind==='event'?eventName(r):kind==='race'?byHorse.get(r.horse_id)?.name_ko:r.label;
      const info=kind==='horse'?r.name_ja:kind==='event'?datestr(r.date):kind==='race'?`${byEvent.get(r.event_id)?eventName(byEvent.get(r.event_id)):r.event_id} · ${datestr(r.date)}`:r.costume;
      const state=edits.has(`${kind}:${id}`)?'수정됨':'원본';
      return `<tr><td>${esc(id)}</td><td>${esc(title||'')}</td><td>${esc(info||'')}</td><td>${state}</td><td><button class="row-btn" data-edit="${esc(id)}">수정</button><button class="row-btn danger" data-delete="${esc(id)}">삭제</button></td></tr>`;
    }).join('')||'<tr><td colspan="5" style="text-align:center;padding:35px">해당 기록이 없습니다.</td></tr>';
  }

  function fresh(k){
    if(k==='horse')return {horse_id:newId(k),horse_index:Math.max(0,...data.horses.map(h=>h.horse_index))+1,name_ko:'',name_ja:'',portrait_url:'',coverage:'수기 추가',last_race_confirmed:false,primary_source_url:'',note:''};
    if(k==='event')return {event_id:newId(k),date:'1998-01-01',venue_ja:'',race_name_ja:'',race_name_ko:'',grade:'',surface_ja:'芝',distance_m:null,image_url:''};
    if(k==='race')return {race_id:newId(k),horse_id:data.horses[0]?.horse_id||'',event_id:'',date:'1998-01-01',finish:null,result_status:'',jockey_ja:'',odds:null,popularity:null,race_time:'',verification:'수기 추가',source_primary_url:'',final_record_flag:false,confirmed_career_final:false};
    return {variant_id:newId(k),variant_no:Math.max(0,...data.variants.map(v=>v.variant_no))+1,horse_id:data.horses[0]?.horse_id||'',horse_name:'',costume:'일반',label:'',portrait_url:''};
  }
  const field=(label,key,type='text',placeholder='')=>`<label class="field">${label}<input data-field="${key}" type="${type}" placeholder="${esc(placeholder)}" value="${esc(draft[key]??'')}"/></label>`;
  const box=(label,key)=>`<label class="field inline"><input data-field="${key}" type="checkbox" ${draft[key]?'checked':''}/>${label}</label>`;
  const choose=(label,key,options)=>`<label class="field">${label}<select data-field="${key}">${options.map(o=>`<option value="${esc(o[0])}" ${draft[key]===o[0]?'selected':''}>${esc(o[1])}</option>`).join('')}</select></label>`;
  const horseSelect=()=>choose('경주마','horse_id',data.horses.map(h=>[h.horse_id,`${h.name_ko} · ${h.name_ja}`]));
  const imageFields=key=>`<div class="image-field"><div class="photo-slot">${uri(draft[key])?`<img src="${uri(draft[key])}" alt="미리보기"/>`:'<span>▧</span>'}</div><div style="flex:1;min-width:0">${field('이미지 URL 또는 ./assets/images/파일명.png',key)}<label class="field">또는 작은 이미지 파일 선택<input id="localImage" type="file" accept="image/png,image/jpeg,image/webp,image/gif"/></label><span class="image-help">이미지가 준비되기 전에는 비워두세요. 350KB 이하 파일만 브라우저에 직접 저장할 수 있습니다.</span></div></div>`;
  function eventChoices(q){const needle=(q||'').trim().toLowerCase(),items=data.events.filter(e=>`${e.date} ${eventName(e)} ${e.race_name_ja} ${e.venue_ja}`.toLowerCase().includes(needle)).slice(0,45);$('eventChoices').innerHTML=items.map(e=>`<button type="button" class="event-choice ${draft.event_id===e.event_id?'active':''}" data-choice="${esc(e.event_id)}">${esc(datestr(e.date))} · <b>${esc(eventName(e))}</b> · ${esc(e.venue_ja)}</button>`).join('')||'<p style="color:#9aaf9e;padding:8px;font-size:11px">검색 결과가 없습니다. 먼저 경기 탭에서 등록하세요.</p>';}
  function openEditor(k,r=null){
    editingKind=k;editingNew=!r;draft=r?clone(r):fresh(k);
    $('editSubtitle').textContent='RECORD EDITOR / '+k.toUpperCase();$('editTitle').textContent=LABELS[k]+' '+(editingNew?'추가':'수정');
    let html='';
    if(k==='horse')html=`<div class="form-split">${field('한국어 이름 *','name_ko','text','트윈터보')}${field('일본어 이름','name_ja')}</div>${choose('검증 상태','coverage',['수기 추가','전적 대조 완료','일부 출전 누락','횟수 재검증 필요'].map(x=>[x,x]))}${box('마지막 출전 기록 검증 완료','last_race_confirmed')}${field('출처 URL','primary_source_url')}${field('비고','note')}${imageFields('portrait_url')}`;
    if(k==='event')html=`<div class="form-split">${field('경주일 *','date','date')}${field('경마장','venue_ja')}</div>${field('경기명 (일본어) *','race_name_ja')}${field('경기명 (한국어)','race_name_ko')}<div class="form-split">${field('등급','grade')}${field('거리 (m)','distance_m','number')}</div>${choose('주로','surface_ja',[['芝','잔디'],['ダ','더트'],['障','장애'],['','미확인']])}${imageFields('image_url')}`;
    if(k==='race')html=`${horseSelect()}<label class="field">기존 경기 검색 (날짜·이름)<input id="eventSearch" placeholder="예: 1998-04-19 또는 아리마" value="${esc(byEvent.get(draft.event_id)?.date||'')}"/></label><div id="eventChoices" class="event-search"></div><p class="image-help" id="eventPicked">선택된 경기: ${esc(draft.event_id||'없음')}</p><div class="form-split">${field('착순 (취소면 비움)','finish','number')}${field('상태 (취소/제외 등)','result_status')}</div><div class="form-split">${field('기수','jockey_ja')}${field('기록 시간','race_time')}</div>${field('출처 URL','source_primary_url')}${box('최종 출전으로 표기','final_record_flag')}${box('최종전 검증 완료','confirmed_career_final')}`;
    if(k==='variant')html=`${horseSelect()}${field('의상 이름','costume')}${imageFields('portrait_url')}`;
    $('editFields').innerHTML=html;$('editOverlay').hidden=false;
    if(k==='race'){eventChoices(byEvent.get(draft.event_id)?.date||'');$('eventSearch').addEventListener('input',ev=>eventChoices(ev.target.value));}
    const upload=$('localImage');if(upload)upload.addEventListener('change',handleLocalImage);
  }
  function closeEditor(){draft=null;$('editOverlay').hidden=true;}
  function handleLocalImage(ev){const f=ev.target.files?.[0];if(!f)return;if(f.size>350000){notify('정적판은 350KB 이하 이미지만 직접 저장합니다. 큰 이미지는 assets/images 폴더를 이용해 주세요.');return;}if(!/^image\/(png|jpeg|webp|gif)$/.test(f.type)){notify('PNG/JPG/WEBP/GIF만 지원합니다.');return;}const reader=new FileReader();reader.onload=()=>{draft[editingKind==='event'?'image_url':'portrait_url']=String(reader.result);$('editFields').querySelector('.photo-slot').innerHTML=`<img src="${uri(reader.result)}" alt="미리보기"/>`;const key=editingKind==='event'?'image_url':'portrait_url',input=$(`editFields`).querySelector(`[data-field="${key}"]`);if(input)input.value=String(reader.result);notify('이미지를 읽었어요. 저장 후 JSON 백업을 권장합니다.');};reader.readAsDataURL(f);}
  function submitEditor(ev){ev.preventDefault();if(!draft)return;
    for(const input of $('editFields').querySelectorAll('[data-field]')){
      if(input.type==='checkbox')draft[input.dataset.field]=input.checked;
      else draft[input.dataset.field]=input.value;
    }
    const k=editingKind;
    if(k==='horse'&&!String(draft.name_ko||'').trim()){notify('경주마 이름을 입력하세요.');return;}
    if(k==='event'&&(!iso(String(draft.date||''))||!String(draft.race_name_ja||'').trim())){notify('정확한 경주일과 경기명이 필요합니다.');return;}
    if(k==='event')draft.distance_m=draft.distance_m===''?null:Number(draft.distance_m);
    if(k==='race'){
      const e=byEvent.get(draft.event_id);if(!e||!byHorse.has(draft.horse_id)){notify('경주마와 기존 경기를 선택하세요.');return;}
      draft.date=e.date;
      for(const f of ['finish','odds','popularity'])draft[f]=draft[f]===''||draft[f]===null?null:Number(draft[f]);
      if(data.races.some(r=>r.horse_id===draft.horse_id&&r.event_id===draft.event_id&&r.race_id!==draft.race_id)){notify('이 말은 해당 경기에 이미 등록되어 있습니다.');return;}
    }
    if(k==='variant'){const h=byHorse.get(draft.horse_id);if(!h){notify('경주마를 선택하세요.');return;}draft.horse_name=h.name_ko;draft.label=`${h.name_ko}(${draft.costume||'일반'})`;}
    if(saveRecord(k,draft)){closeEditor();notify('기록을 브라우저에 저장했습니다.');}
  }
  function deleteRecord(k,id){const r=data[KINDS[k]].find(row=>idFor(k,row)===id);if(!r)return;const dependent=k==='horse'?data.races.filter(x=>x.horse_id===id).length+data.variants.filter(x=>x.horse_id===id).length:k==='event'?data.races.filter(x=>x.event_id===id).length:0;if(!confirm(`${LABELS[k]} ${id}를 삭제할까요?${dependent?`\n연결된 기록 ${dependent}건도 삭제 표시됩니다.`:''}\n원본 파일은 유지됩니다.`))return;const changes=[{kind:k,id,operation:'delete'}];if(k==='horse')for(const x of [...data.races.filter(x=>x.horse_id===id).map(x=>({kind:'race',id:x.race_id})),...data.variants.filter(x=>x.horse_id===id).map(x=>({kind:'variant',id:x.variant_id}))])changes.push({...x,operation:'delete'});if(k==='event')for(const r of data.races.filter(x=>x.event_id===id))changes.push({kind:'race',id:r.race_id,operation:'delete'});if(persist(changes))notify('삭제 내역을 브라우저에 저장했습니다.');}
  function exportJSON(){const out={...data,meta:{...data.meta,exported_at:new Date().toISOString(),source:'UMA RACE ATLAS GitHub Pages'}};const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`uma-race-atlas-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('JSON 백업 파일을 내려받았어요.');}
  async function importJSON(file){try{const input=JSON.parse(await file.text());if(!['horses','events','races','variants'].every(k=>Array.isArray(input[k])))throw Error('이 사이트에서 내보낸 JSON 형식이 아닙니다.');const changes=[];for(const k of Object.keys(KINDS)){const idKey=KEYS[k],base=new Map(data[KINDS[k]].map(x=>[x[idKey],x]));for(const item of input[KINDS[k]]){const id=item?.[idKey];if(typeof id!=='string'||!id)continue;if(JSON.stringify(base.get(id))!==JSON.stringify(item))changes.push({kind:k,id,operation:'upsert',record:item});}}if(!changes.length){notify('이미 동일한 기록입니다.');return;}if(!confirm(`${changes.length}개 기록을 추가·수정할까요? 없는 기록은 삭제하지 않고 병합합니다.`))return;if(persist(changes))notify(`${changes.length}건을 병합했어요.`);}catch(err){notify(err.message||'파일을 읽지 못했습니다.');}}

  let imageExportBusy=false;
  async function exportFullImage(format){
    if(imageExportBusy)return;
    if(!window.UmaFullImageExport){notify('이미지 출력 스크립트가 없습니다. full-export.js 파일을 확인해 주세요.');return;}
    imageExportBusy=true;
    $('exportFullSvg').disabled=true;$('exportFullPng').disabled=true;
    $('fullExportStatus').textContent='전체 기록과 이미지 처리 중...';
    try{
      const range=bounds();
      const result=await window.UmaFullImageExport.save(data,{format,startYear:range.min,endYear:range.max,onProgress:msg=>$('fullExportStatus').textContent=msg});
      $('fullExportStatus').textContent=`원본 벡터 ${fmt(result.width)} × ${fmt(result.height)} · 원본 이미지 포함 ${result.stats.embedded}개${result.stats.skipped?` · 포함 실패 ${result.stats.skipped}개`:''}`;
      notify(`${format==='svg'?'SVG 원본':'PNG 고화질'} 이미지 파일을 내려받았어요.`);
    }catch(err){$('fullExportStatus').textContent=err.message||'이미지 생성 실패';notify('이미지 생성이 완료되지 않았습니다. SVG를 먼저 시도해 주세요.');}
    finally{imageExportBusy=false;$('exportFullSvg').disabled=false;$('exportFullPng').disabled=false;}
  }

  // Interaction handlers: all actions work when opened from a local HTML file or GitHub Pages.
  $('goHome').addEventListener('click',()=>setView('timeline'));
  $('navTimeline').addEventListener('click',()=>setView('timeline'));
  $('navManage').addEventListener('click',()=>setView('manage'));
  $('heroAdd').addEventListener('click',()=>setView('manage'));
  $('backBtn').addEventListener('click',()=>setView('timeline'));
  for(const id of ['heroBackup','stripBackup','backupBtn'])$(id).addEventListener('click',exportJSON);
  $('exportFullSvg').addEventListener('click',()=>exportFullImage('svg'));
  $('exportFullPng').addEventListener('click',()=>exportFullImage('png'));
  $('importBtn').addEventListener('click',()=>$('importFile').click());
  $('importFile').addEventListener('change',async ev=>{const f=ev.target.files?.[0];if(f)await importJSON(f);ev.target.value='';});
  $('horseSearch').addEventListener('input',renderHorseList);
  $('horseList').addEventListener('click',ev=>{const b=ev.target.closest('[data-id]');if(!b)return;selectedCustom=true;if(selected.has(b.dataset.id))selected.delete(b.dataset.id);else selected.add(b.dataset.id);render();});
  $('selectAll').addEventListener('click',()=>{selectedCustom=false;selected=new Set(data.horses.map(h=>h.horse_id));render();});
  $('clearAll').addEventListener('click',()=>{selectedCustom=true;selected.clear();render();});
  document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{const p=PRESETS[button.dataset.preset];selectedCustom=true;selected=new Set(data.horses.filter(h=>p.names.includes(h.name_ko)).map(h=>h.horse_id));startYear=p.year;period='2';render();}));
  $('startYear').addEventListener('change',ev=>{startYear=Math.max(bounds().min,Math.min(2025,Number(ev.target.value)||1998));renderTimeline();});
  $('prevYear').addEventListener('click',()=>{startYear=Math.max(bounds().min,startYear-1);renderTimeline();});
  $('nextYear').addEventListener('click',()=>{startYear=Math.min(2025,startYear+1);renderTimeline();});
  $('period').addEventListener('change',ev=>{period=ev.target.value;renderTimeline();});
  $('zoom').addEventListener('change',ev=>{zoom=Number(ev.target.value);renderTimeline();});
  let syncGuard=false;
  $('labelsScroll').addEventListener('scroll',ev=>{if(syncGuard)return;syncGuard=true;$('tracksScroll').scrollTop=ev.target.scrollTop;syncGuard=false;});
  $('tracksScroll').addEventListener('scroll',ev=>{if(syncGuard)return;syncGuard=true;$('labelsScroll').scrollTop=ev.target.scrollTop;syncGuard=false;});
  $('trackLabels').addEventListener('click',ev=>{const b=ev.target.closest('[data-id]');if(b){detailKind='horse';detailId=b.dataset.id;renderDetail();}});
  $('raceSvg').addEventListener('click',ev=>{const node=ev.target.closest('[data-event]');if(node){detailKind='event';detailId=node.dataset.event;renderDetail();}});
  $('raceSvg').addEventListener('keydown',ev=>{if(ev.key==='Enter'){const node=ev.target.closest('[data-event]');if(node){detailKind='event';detailId=node.dataset.event;renderDetail();}}});
  $('detail').addEventListener('click',ev=>{if(ev.target.closest('[data-close]')){$('detail').hidden=true;detailId='';return;}const event=ev.target.closest('[data-event]'),horse=ev.target.closest('[data-horse]');if(event){detailKind='event';detailId=event.dataset.event;renderDetail();}else if(horse){detailKind='horse';detailId=horse.dataset.horse;renderDetail();}});
  document.querySelectorAll('[data-kind]').forEach(b=>b.addEventListener('click',()=>{kind=b.dataset.kind;page=0;search='';$('manageSearch').value='';renderManagement();}));
  $('manageSearch').addEventListener('input',ev=>{search=ev.target.value;page=0;renderManagement();});
  $('pagePrev').addEventListener('click',()=>{page=Math.max(0,page-1);renderManagement();});
  $('pageNext').addEventListener('click',()=>{page++;renderManagement();});
  $('addRecord').addEventListener('click',()=>openEditor(kind));
  $('recordsBody').addEventListener('click',ev=>{const edit=ev.target.closest('[data-edit]'),del=ev.target.closest('[data-delete]');if(edit){const record=data[KINDS[kind]].find(r=>idFor(kind,r)===edit.dataset.edit);if(record)openEditor(kind,record);}if(del)deleteRecord(kind,del.dataset.delete);});
  $('editFields').addEventListener('click',ev=>{const b=ev.target.closest('[data-choice]');if(!b||!draft)return;draft.event_id=b.dataset.choice;const e=byEvent.get(draft.event_id);$('eventPicked').textContent=`선택된 경기: ${e?datestr(e.date)+' · '+eventName(e):'없음'}`;eventChoices($('eventSearch').value);});
  $('editForm').addEventListener('submit',submitEditor);
  $('closeEditor').addEventListener('click',closeEditor);$('cancelEditor').addEventListener('click',closeEditor);
  $('editOverlay').addEventListener('mousedown',ev=>{if(ev.target===$('editOverlay'))closeEditor();});
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape'){$('detail').hidden=true;detailId='';if(!$('editOverlay').hidden)closeEditor();}});

  rebuild();render();
})();
