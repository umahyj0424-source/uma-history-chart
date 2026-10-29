/* UMA RACE ATLAS — single-image, full-history export engine.
 * SVG keeps vectors sharp at every zoom and embeds source image bytes without re-encoding.
 * A bounded PNG option rasterizes the same SVG for applications that require PNG.
 */
(() => {
  'use strict';
  const DAY=86400000;
  const PALETTE=['#dc875c','#459a99','#777bb9','#d7a64c','#7aa17c','#b677a0','#6598bb','#b39a69','#b86c74','#5b9c7e'];
  const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const cleanDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''))?d:null;
  const time=d=>Date.parse(`${d}T00:00:00Z`);
  const diff=(a,b)=>(time(b)-time(a))/DAY;
  const dateLabel=d=>String(d||'').replaceAll('-','.');
  const name=e=>e.race_name_ko||e.race_name_ja||'경기명 미확인';
  const bad=r=>/取消|除外|취소|제외/.test(r.result_status||'');
  const color=h=>PALETTE[((h.horse_index||1)-1)%PALETTE.length];
  const fmt=n=>Number(n).toLocaleString('ko-KR');
  const isImageData=s=>/^data:image\/(png|jpeg|webp|gif);base64,/i.test(s);
  const isSafeUrl=s=>/^(https?:\/\/|\.\.?\/|\/)/i.test(s);
  const cap=s=>String(s||'').length>22?String(s).slice(0,21)+'…':String(s||'');

  function imageForHorse(h,variants){
    return h.portrait_url||variants.find(v=>v.horse_id===h.horse_id&&v.costume==='일반'&&v.portrait_url)?.portrait_url||variants.find(v=>v.horse_id===h.horse_id&&v.portrait_url)?.portrait_url||'';
  }
  async function imageAsDataURL(path){
    if(isImageData(path))return {value:path,bytes:Math.ceil(path.length*0.75)};
    if(!isSafeUrl(path)||typeof fetch==='undefined')return null;
    const res=await fetch(path,{credentials:'same-origin'});
    if(!res.ok)throw Error(`이미지 응답 ${res.status}`);
    const blob=await res.blob();
    if(!/^image\/(png|jpeg|webp|gif)$/.test(blob.type))return null;
    const result=await new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('이미지 읽기 실패'));reader.readAsDataURL(blob);
    });
    return {value:String(result),bytes:blob.size};
  }
  async function collectImages(horses,events,variants,{embedImages=true,embeddedImages,onProgress=()=>{}}={}){
    const images=new Map(),sources=new Set();
    for(const h of horses){const src=imageForHorse(h,variants);if(src)sources.add(src);}
    for(const event of events)if(event.image_url)sources.add(event.image_url);
    // Preloaded original bytes support deterministic, standalone SVG builds in Node.
    if(embeddedImages&&typeof embeddedImages.get==='function')for(const src of sources){
      const value=embeddedImages.get(src);
      if(isImageData(value))images.set(src,value);
    }
    const queue=[...sources].filter(src=>!images.has(src));let done=0,used=0,failed=0;
    if(!embedImages)return {images,failed:0,embedded:images.size,skipped:sources.size-images.size};
    const MAX_IMAGE_BYTES=96*1024*1024;
    // Limit parallel reads and total embedded bytes so a future image-rich dataset stays usable.
    const worker=async()=>{while(queue.length){const src=queue.shift();if(!src)continue;try{
      const value=await imageAsDataURL(src);
      if(value&&used+value.bytes<=MAX_IMAGE_BYTES){images.set(src,value.value);used+=value.bytes;}
      else failed++;
    }catch{failed++;}finally{done++;if(done===sources.size||done%10===0)onProgress(`원본 이미지 수집 ${images.size}/${sources.size}`);}}};
    await Promise.all(Array.from({length:Math.min(4,queue.length)},worker));
    return {images,failed,embedded:images.size,skipped:Math.max(0,sources.size-images.size)};
  }

  async function buildSVG(data,options={}){
    if(!data||!Array.isArray(data.horses)||!Array.isArray(data.races)||!Array.isArray(data.events))throw Error('전체 이미지 생성에 필요한 데이터가 없습니다.');
    const onProgress=typeof options.onProgress==='function'?options.onProgress:()=>{};
    const horses=[...data.horses].sort((a,b)=>a.horse_index-b.horse_index||a.name_ko.localeCompare(b.name_ko));
    const events=data.events.filter(x=>cleanDate(x.date));
    const actualYears=events.map(x=>Number(x.date.slice(0,4)));
    const start=Number.isFinite(options.startYear)?options.startYear:Math.min(...actualYears,1976);
    const last=Number.isFinite(options.endYear)?options.endYear:Math.max(...actualYears,2021);
    const begin=`${start}-01-01`,end=`${last+1}-01-01`;
    const days=diff(begin,end);
    const startX=352,scale=Math.min(1.52,28500/Math.max(days,1));
    const width=Math.ceil(startX+days*scale+105),row=88,top=220,height=top+row*horses.length+115;
    const xOf=d=>startX+diff(begin,d)*scale;
    const yOf=i=>top+i*row+row/2;
    const byEvent=new Map(events.map(x=>[x.event_id,x]));
    const byHorse=new Map(horses.map((h,i)=>[h.horse_id,{h,i,records:[]}]));
    for(const r of data.races){if(byHorse.has(r.horse_id)&&!bad(r)&&cleanDate(r.date))byHorse.get(r.horse_id).records.push(r);}
    for(const v of byHorse.values())v.records.sort((a,b)=>a.date.localeCompare(b.date)||a.race_id.localeCompare(b.race_id));
    const imageData=await collectImages(horses,events,data.variants||[],options);
    const svg=[];const push=s=>svg.push(s);
    onProgress('전체 경기 위치 계산 중');
    push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="UMA RACE ATLAS: ${start}년부터 ${last}년까지 전체 경주마 타임라인">`);
    push(`<title>UMA RACE ATLAS · ${start}—${last} · 모든 경주마와 출전 경기</title><desc>${horses.length}마리 경주마, ${events.length}개 경기, ${data.races.length}개 출전 기록. 같은 경기의 경주마는 동일 날짜 x좌표에 놓입니다.</desc>`);
    push(`<defs><linearGradient id="topFill" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#163d31"/><stop offset="1" stop-color="#306c4e"/></linearGradient><pattern id="field" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M0 18L18 0" stroke="#cadbca" stroke-width=".45" opacity=".25"/></pattern></defs>`);
    push(`<rect width="${width}" height="${height}" fill="#f7faf5"/><rect width="${width}" height="${top}" fill="#e9f2e8"/><rect width="${width}" height="103" fill="url(#topFill)"/>`);
    push(`<text x="48" y="66" font-family="Georgia,serif" font-size="50" font-weight="700" fill="#ffffff">UMA RACE ATLAS</text><text x="${width-50}" y="58" text-anchor="end" font-family="sans-serif" font-size="31" font-weight="700" fill="#ebf5ed">${start} — ${last}</text><text x="${width-50}" y="81" text-anchor="end" font-family="sans-serif" font-size="17" fill="#bedbcb">FULL CHRONOLOGY / ORIGINAL QUALITY SVG</text>`);
    push(`<text x="48" y="146" font-family="sans-serif" font-size="18" font-weight="800" fill="#2c6850">${fmt(horses.length)} HORSES</text><text x="230" y="146" font-family="sans-serif" font-size="18" font-weight="800" fill="#2c6850">${fmt(events.length)} EVENTS</text><text x="455" y="146" font-family="sans-serif" font-size="18" font-weight="800" fill="#2c6850">${fmt(data.races.length)} START RECORDS</text>`);
    push(`<text x="35" y="201" font-family="sans-serif" font-size="13" font-weight="800" letter-spacing="2" fill="#6b9276">RACEHORSES</text><text x="${startX}" y="201" font-family="sans-serif" font-size="11" fill="#839e8b">날짜 간격 실제 비례 · 세로 점선은 같은 경기 · 지점에 마우스를 올리면 경기 이름 표시</text>`);
    const portraits=new Map();let defs=[];
    horses.forEach((h,i)=>{const src=imageForHorse(h,data.variants||[]),resolved=imageData.images.get(src);if(resolved){const id=`photo-${i}`;portraits.set(h.horse_id,id);defs.push(`<symbol id="${id}" viewBox="0 0 48 48"><image x="0" y="0" width="48" height="48" preserveAspectRatio="xMidYMid slice" href="${e(resolved)}"/></symbol>`);}});
    const racePhotos=new Map(),racePhotoAssets=new Map();events.forEach(event=>{
      const src=event.image_url||'',resolved=imageData.images.get(src);if(!resolved)return;
      let id=racePhotoAssets.get(src);
      if(!id){id=`racephoto-${racePhotoAssets.size}`;racePhotoAssets.set(src,id);defs.push(`<symbol id="${id}" viewBox="0 0 58 37"><image x="0" y="0" width="58" height="37" preserveAspectRatio="xMidYMid slice" href="${e(resolved)}"/></symbol>`);}
      racePhotos.set(event.event_id,id);
    });
    if(defs.length)push(`<defs>${defs.join('')}</defs>`);defs=[];

    // Chronological grid. Years and months have exact day spacing even in leap years.
    push(`<g id="calendar" font-family="sans-serif">`);
    for(let year=start;year<=last;year++){
      const x=xOf(`${year}-01-01`),nx=xOf(`${year+1}-01-01`);
      if((year-start)%2===0)push(`<rect x="${x}" y="${top}" width="${nx-x}" height="${height-top}" fill="#e8f2e7" opacity=".25"/>`);
      push(`<line x1="${x}" y1="164" x2="${x}" y2="${height-65}" stroke="#8fb49a" stroke-width="2.1"/><text x="${x+9}" y="184" font-family="Georgia,serif" font-size="24" font-weight="700" fill="#245d44">${year}</text>`);
      for(let m=2;m<=12;m++){
        const d=`${year}-${String(m).padStart(2,'0')}-01`,mx=xOf(d);
        push(`<line x1="${mx}" y1="210" x2="${mx}" y2="${height-65}" stroke="#bed2c1" stroke-width=".7" stroke-dasharray="3 9" opacity=".65"/>`);
      }
    }
    push('</g>');
    // Horse lanes and uninterrupted career segments.
    for(let i=0;i<horses.length;i++){
      const h=horses[i],y=yOf(i),c=color(h),records=byHorse.get(h.horse_id).records;
      if(i%2===0)push(`<rect x="0" y="${top+i*row}" width="${width}" height="${row}" fill="#ffffff" opacity=".55"/>`);
      push(`<line x1="0" y1="${top+(i+1)*row}" x2="${width}" y2="${top+(i+1)*row}" stroke="#dfeadd" stroke-width="1"/>`);
      push(`<rect x="21" y="${y-25}" width="51" height="51" rx="9" fill="#edf5ea" stroke="${c}" stroke-width="2"/>`);
      if(portraits.has(h.horse_id))push(`<use href="#${portraits.get(h.horse_id)}" x="23" y="${y-23}" width="47" height="47"/>`);
      else push(`<rect x="28" y="${y-18}" width="38" height="38" rx="6" stroke="#afc8b2" stroke-dasharray="4 3" fill="none"/><text x="47" y="${y+7}" text-anchor="middle" font-size="23" fill="#a9c4ae">+</text>`);
      push(`<text x="84" y="${y-6}" font-family="sans-serif" font-weight="800" font-size="19" fill="#28523d">${e(h.name_ko)}</text>`);
      push(`<text x="84" y="${y+16}" font-family="sans-serif" font-size="11" fill="#7a9a83">${e(records.length)}전 · ${h.last_race_confirmed?'최종전 확인':'전적 보완 중'}</text>`);
      if(!records.length){push(`<text x="${startX+27}" y="${y+5}" font-family="sans-serif" font-size="13" fill="#a4b9a8">출전 기록 없음</text>`);continue;}
      const first=records[0].date,final=records.at(-1).date,from=Math.max(startX,xOf(first)),to=Math.min(xOf(final),xOf(end)-1);
      if(to>=startX&&from<width){
        push(`<line x1="${from}" y1="${y}" x2="${Math.max(from,to)}" y2="${y}" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`);
        push(`<circle cx="${from}" cy="${y}" r="11" fill="#fff" stroke="${c}" stroke-width="3"/>`);
        if(final<end){push(`<circle cx="${to}" cy="${y}" r="11" fill="${c}" stroke="#fff" stroke-width="3"/><rect x="${to+12}" y="${y-33}" width="110" height="21" rx="10" fill="${h.last_race_confirmed?'#236448':'#82775a'}"/><text x="${to+67}" y="${y-18}" text-anchor="middle" font-size="11" font-family="sans-serif" font-weight="700" fill="#fff">${h.last_race_confirmed?'최종 출전':'마지막 확인'}</text>`);}
      }
    }
    onProgress('동일 경기 연결선 및 출전 지점 작성 중');
    // One calendar column per real event ID, independently of which horses ran it.
    const eventLines=new Map();
    for(const r of data.races){if(bad(r))continue;const h=byHorse.get(r.horse_id),event=byEvent.get(r.event_id);if(!h||!event||event.date<begin||event.date>=end)continue;let record=eventLines.get(event.event_id);if(!record){record={event,indices:[]};eventLines.set(event.event_id,record);}record.indices.push(h.i);}
    push('<g id="shared-races">');
    for(const {event,indices} of eventLines.values()){
      if(indices.length<2)continue;
      const x=xOf(event.date),lo=Math.min(...indices),hi=Math.max(...indices);
      push(`<line x1="${x}" y1="${yOf(lo)}" x2="${x}" y2="${yOf(hi)}" stroke="#207b71" stroke-width="2" stroke-dasharray="6 8" opacity=".38"><title>${e(dateLabel(event.date))} · ${e(name(event))} · 동시 출전 ${indices.length}마리</title></line>`);
    }
    push('</g><g id="race-starts">');
    for(const r of data.races){if(bad(r))continue;const h=byHorse.get(r.horse_id),event=byEvent.get(r.event_id);if(!h||!event||event.date<begin||event.date>=end)continue;
      const x=xOf(event.date),y=yOf(h.i),c=color(h.h),grade=event.grade||'',big=/^(G[ⅠI1]|Jpn[ⅠI1])/i.test(grade),shared=eventLines.get(event.event_id)?.indices.length>=2;
      push(`<g><title>${e(`${dateLabel(event.date)} · ${name(event)} (${event.venue_ja||'경마장 미확인'}) · ${h.h.name_ko} · ${r.finish?`${r.finish}착`:r.result_status||'착순 미확인'}${r.jockey_ja?` · ${r.jockey_ja}`:''}`)}</title><circle cx="${x}" cy="${y}" r="${big?10:7.5}" fill="#fff" stroke="${c}" stroke-width="${big?3.6:2.8}"/><circle cx="${x}" cy="${y}" r="3" fill="${shared?'#cfa14c':c}"/></g>`);
    }
    push('</g>');
    // Race photograph is placed once per event, avoiding many duplicated images for shared starts.
    if(racePhotos.size){push('<g id="race-photos">');for(const [id,ref] of racePhotos){const v=eventLines.get(id);if(!v)continue;const x=xOf(v.event.date),y=yOf(Math.min(...v.indices));push(`<use href="#${ref}" x="${x-29}" y="${y-55}" width="58" height="37"><title>${e(name(v.event))} · 사진</title></use>`);}push('</g>');}
    push(`<rect x="0" y="${height-60}" width="${width}" height="60" fill="#e6efe3"/><text x="44" y="${height-23}" font-family="sans-serif" font-size="15" fill="#5b8467">UMA RACE ATLAS · ${start}—${last} · 편집 데이터의 출처 및 원본 이미지 권한은 공개 전 확인해 주세요.</text><text x="${width-44}" y="${height-23}" text-anchor="end" font-family="sans-serif" font-size="15" fill="#5b8467">SVG VECTOR · ${width} × ${height}</text></svg>`);
    return {svg:svg.join(''),width,height,stats:{horses:horses.length,events:events.length,races:data.races.length,shared:[...eventLines.values()].filter(v=>v.indices.length>1).length,...imageData}};
  }

  function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function readSvgSize(svg){const width=Number(svg.match(/<svg[^>]*\bwidth="(\d+)"/)?.[1]);const height=Number(svg.match(/<svg[^>]*\bheight="(\d+)"/)?.[1]);if(!width||!height)throw Error('이미지 크기를 찾지 못했습니다.');return {width,height};}
  async function pngFromSVG(svg,progress=()=>{}){
    if(typeof document==='undefined')throw Error('PNG 출력은 브라우저에서 실행해야 합니다.');
    const {width,height}=readSvgSize(svg);
    // ~55 megapixels / 12000 px dimension: high resolution without a ~1GB single canvas.
    const scale=Math.min(1,12000/width,12000/height,Math.sqrt(55000000/(width*height)));
    const w=Math.floor(width*scale),h=Math.floor(height*scale);
    // Set the SVG's intrinsic raster size before decoding. Otherwise a browser may
    // allocate the entire 26k-wide original image before downscaling to the canvas.
    const rasterSVG=svg.replace(/(<svg\b[^>]*?\bwidth=")\d+(")/,'$1'+w+'$2')
      .replace(/(<svg\b[^>]*?\bheight=")\d+(")/,'$1'+h+'$2');
    const blob=new Blob([rasterSVG],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);
    progress(`PNG 래스터화 ${fmt(w)} × ${fmt(h)}px`);
    try{
      const img=new Image();
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('SVG 이미지 래스터화에 실패했습니다. SVG 원본을 사용해 주세요.'));img.src=url;});
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('이 브라우저는 고해상도 PNG 출력을 지원하지 않습니다. SVG를 다운로드해 주세요.');
      ctx.fillStyle='#f7faf5';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
      const result=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      canvas.width=1;canvas.height=1;
      if(!result)throw Error('PNG 메모리 한도에 도달했습니다. 벡터 SVG를 사용해 주세요.');
      return {blob:result,width:w,height:h};
    }finally{URL.revokeObjectURL(url);}
  }
  async function save(data,{format='svg',onProgress=()=>{},...options}={}){
    const result=await buildSVG(data,{...options,onProgress});
    const firstYear=Number.isFinite(options.startYear)?options.startYear:1976;
    const lastYear=Number.isFinite(options.endYear)?options.endYear:2021;
    const prefix=`uma-race-atlas-full-${firstYear}-${lastYear}`;
    if(format==='png'){
      const png=await pngFromSVG(result.svg,onProgress);
      downloadBlob(png.blob,`${prefix}-highres.png`);
      onProgress(`PNG 생성 완료 (${fmt(png.width)} × ${fmt(png.height)}px)`);
      return {...result,pngWidth:png.width,pngHeight:png.height};
    }
    downloadBlob(new Blob([result.svg],{type:'image/svg+xml;charset=utf-8'}),`${prefix}-original.svg`);
    onProgress('SVG 생성 완료 · 원본 사진 데이터 포함');
    return result;
  }
  window.UmaFullImageExport={buildSVG,pngFromSVG,save};
})();
