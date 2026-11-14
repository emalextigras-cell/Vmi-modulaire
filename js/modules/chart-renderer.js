/** Rendu SVG des graphiques et infobulles tactiles. */
import { absoluteHumidity } from './psychrometry.js';
import { pad, dayStart, shiftDay } from './date-utils.js';
import { isPlausibleHumidity, isPlausibleTemperature } from './data-quality.js';
const COLORS=['#286348','#c16b32','#356da5','#8056a8'];
const viewStates=new Map();
export function resetChartViews(){viewStates.clear();}
const fmtTick=(t,withHour)=>{const d=new Date(t);return withHour?`${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}h`:`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${String(d.getFullYear()).slice(2)}`};
const fmtPoint=(t,daily)=>{const d=new Date(t);return daily?`${pad(d.getHours())}:${pad(d.getMinutes())}`:`${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`};
/* Conserve les relevés tels quels : aucune valeur manquante n'est interpolée.
   Un point absent ou rejeté crée une interruption visible dans la courbe. */
export function fillMissing(points){
 return points.map(p=>({t:p.t,v:Number.isFinite(p.v)?p.v:null,blocked:!!p.blocked||!Number.isFinite(p.v)}));
}
export function hasBlockedBetween(points, startTime, endTime){
 return points.some(point=>point.blocked&&point.t>startTime&&point.t<endTime);
}
function drawChart(id,title,series,selectedDate,$){
 const el=$(id),all=series.flatMap(s=>s.points.filter(p=>Number.isFinite(p.v)));
 if(!all.length){el.innerHTML='<p class="note">Pas de données disponibles pour cette période.</p>';return}
 const W=700,H=215,L=48,R=12,T=18,B=30;
 const daily=!!selectedDate;
 let x0,x1;
 if(daily){x0=dayStart(selectedDate);x1=dayStart(shiftDay(selectedDate,1))}
 else{x0=Math.min(...all.map(p=>p.t));x1=Math.max(...all.map(p=>p.t));if(x0===x1)x1=x0+3600000}
 const baseX0=x0,baseX1=x1,baseSpan=baseX1-baseX0;
 const view=viewStates.get(id)||{factor:1,center:.5};viewStates.set(id,view);
 const viewSpan=baseSpan/view.factor;
 x0=baseX0+(baseSpan-viewSpan)*view.center;x1=x0+viewSpan;
 const vals=all.map(p=>p.v);let y0=Math.min(...vals),y1=Math.max(...vals);if(y0===y1){y0-=1;y1+=1}
 const margin=(y1-y0)*.1;y0-=margin;y1+=margin;
 const X=t=>L+(t-x0)/(x1-x0)*(W-L-R),Y=v=>T+(1-(v-y0)/(y1-y0))*(H-T-B);
 let svg='';
 for(let i=0;i<=4;i++){const v=y0+(y1-y0)*i/4,y=Y(v);svg+=`<line class="gridline" x1="${L}" x2="${W-R}" y1="${y}" y2="${y}"/><text x="${L-7}" y="${y+3}" text-anchor="end">${v.toFixed(1)}</text>`}
 if(daily){for(let h=0;h<=24;h+=3){const tick=new Date(x0);tick.setHours(h,0,0,0);const x=X(tick.getTime());svg+=`<line class="gridline" x1="${x}" x2="${x}" y1="${T}" y2="${H-B}"/><text x="${x}" y="${H-10}" text-anchor="${h===0?'start':h===24?'end':'middle'}">${pad(h)}h</text>`}}
 else{const span=x1-x0,withHour=span<=3*86400000;for(let i=0;i<=4;i++){const t=x0+span*i/4,x=X(t);svg+=`<text x="${x}" y="${H-10}" text-anchor="${i===0?'start':i===4?'end':'middle'}">${fmtTick(t,withHour)}</text>`}}
 /* seuil de trou calculé série par série : le trait est interrompu quand des relevés manquent */
 const gaps=new Map();
 for(const s of series){const dts=[];for(let i=1;i<s.points.length&&dts.length<400;i++)dts.push(s.points[i].t-s.points[i-1].t);dts.sort((a,b)=>a-b);gaps.set(s,Math.max(4*3600000,6*(dts.length?dts[Math.floor(dts.length/2)]:0)))}
 for(const s of series){
  const pts=s.points.filter(p=>Number.isFinite(p.v));if(!pts.length)continue;
  const gap=gaps.get(s);
  // Chaque relevé réel est tracé pour les historiques usuels ; au-delà de 5 000, affichage allégé.
  const step=pts.length>5000?Math.ceil(pts.length/5000):1;
  const sel=pts.filter((p,i)=>i%step===0||i===pts.length-1);
  let d='',prev=null,segLen=0,dots='';
  sel.forEach(p=>{
   const blockedBetween=prev!==null&&hasBlockedBetween(s.points,prev.t,p.t);
   if(prev===null||p.t-prev.t>gap||blockedBetween){if(segLen===1)dots+=`<circle cx="${X(prev.t).toFixed(1)}" cy="${Y(prev.v).toFixed(1)}" r="1.8" fill="${s.color}"/>`;d+=`M${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`;segLen=1}
   else{d+=`L${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`;segLen++}
   prev=p;
  });
  if(segLen===1&&prev)dots+=`<circle cx="${X(prev.t).toFixed(1)}" cy="${Y(prev.v).toFixed(1)}" r="1.8" fill="${s.color}"/>`;
  svg+=`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.8" stroke-linejoin="round"/>${dots}`;
 }
 const legend=series.map(s=>`<span><i class="dot" style="background:${s.color}"></i>${s.name}</span>`).join('');
 el.innerHTML=`<div class="chart-toolbar"><div class="legend">${legend}</div><div class="zoom-controls"><button type="button" data-zoom="out" aria-label="Dézoomer" ${view.factor<=1?'disabled':''}>−</button><span>${view.factor.toFixed(1).replace('.0','')}×</span><button type="button" data-zoom="in" aria-label="Zoomer" ${view.factor>=20?'disabled':''}>+</button><button type="button" data-zoom="left" aria-label="Déplacer vers la gauche" ${view.factor<=1?'disabled':''}>◀</button><button type="button" data-zoom="right" aria-label="Déplacer vers la droite" ${view.factor<=1?'disabled':''}>▶</button><button type="button" data-zoom="reset" ${view.factor<=1?'disabled':''}>Réinitialiser</button></div></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">${svg}<line id="${id}Cur" class="gridline" y1="${T}" y2="${H-B}" x1="0" x2="0" style="display:none"/></svg><div class="tip"></div>`;
 el.querySelectorAll('[data-zoom]').forEach(button=>button.addEventListener('click',()=>{const action=button.dataset.zoom;if(action==='in'){view.factor=Math.min(20,view.factor*1.6);}else if(action==='out'){view.factor=Math.max(1,view.factor/1.6);if(view.factor===1)view.center=.5;}else if(action==='left'){view.center=Math.max(0,view.center-.18/view.factor);}else if(action==='right'){view.center=Math.min(1,view.center+.18/view.factor);}else{view.factor=1;view.center=.5;}drawChart(id,title,series,selectedDate,$);}));
 /* Recherche dichotomique : évite de parcourir tout l'historique à chaque mouvement du doigt. */
 const nearest=(points,t)=>{let lo=0,hi=points.length;while(lo<hi){const mid=(lo+hi)>>1;if(points[mid].t<t)lo=mid+1;else hi=mid;}let best=null;for(let k=Math.max(0,lo-1);k<Math.min(points.length,lo+2);k++){const p=points[k];if(Number.isFinite(p.v)){const dd=Math.abs(p.t-t);if(!best||dd<best.dd)best={dd,t:p.t,v:p.v};}}return best;};
 const nearestPoints=series.map(s=>({series:s,points:s.points.filter(p=>Number.isFinite(p.v))}));
 /* Infobulle : pour chaque courbe, le relevé le plus proche du doigt */
 const svgEl=el.querySelector('svg'),tip=el.querySelector('.tip'),cursor=el.querySelector('#'+id+'Cur');
 const move=e=>{
  const rect=svgEl.getBoundingClientRect(),w=rect.width||W;
  const tVal=x0+((e.clientX-rect.left)*(W/w)-L)/(W-L-R)*(x1-x0);
  let txt=null,tShown=null;
  for(const entry of nearestPoints){
   const s=entry.series,q=nearest(entry.points,tVal);
   if(q&&q.dd<=Math.max(1800000,(x1-x0)/50)){if(txt===null){txt=fmtPoint(q.t,daily)+' · ';tShown=q.t}txt+=`${s.name} ${q.v.toFixed(1)}  `}
  }
  if(txt===null)return;
  tip.textContent=txt.trim();tip.style.display='block';
  const cr=el.getBoundingClientRect();
  tip.style.left=Math.max(0,Math.min(e.clientX-cr.left+8,cr.width-tip.offsetWidth-2))+'px';tip.style.top='22px';
  const cx=X(tShown);cursor.setAttribute('x1',cx);cursor.setAttribute('x2',cx);cursor.style.display='block';
 };
 svgEl.addEventListener('pointermove',move);svgEl.addEventListener('pointerdown',move);
 svgEl.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'){tip.style.display='none';cursor.style.display='none'}});
}
function seriesFor(data,key,name,color,derive=null,invalid=null){
 const points=data.map(r=>({t:r.t,v:derive?derive(r):r[key],blocked:invalid?invalid(r):false}));
 return {name,color,points:fillMissing(points)};
}
export function renderCharts(data,selectedDate,$){
 drawChart('chartRH','Humidité relative',[
  seriesFor(data,'sh','Salon',COLORS[0],r=>isPlausibleHumidity(r.sh)?r.sh:null,r=>Number.isFinite(r.sh)&&!isPlausibleHumidity(r.sh)),seriesFor(data,'h1','Sonde résistances',COLORS[1],r=>isPlausibleHumidity(r.h1)?r.h1:null,r=>Number.isFinite(r.h1)&&!isPlausibleHumidity(r.h1)),seriesFor(data,'he','Air entrant',COLORS[2],r=>isPlausibleHumidity(r.he)?r.he:null,r=>Number.isFinite(r.he)&&!isPlausibleHumidity(r.he))],selectedDate,$);
 drawChart('chartVmiAbs','Humidité absolue exportée par VMI+ (valeurs brutes, unité à confirmer)',[
  seriesFor(data,'vmiAbsP0','P0 sortie résistance',COLORS[1]),
  seriesFor(data,'vmiAbsP1','P1 entrée air',COLORS[2])],selectedDate,$);
 drawChart('chartHA','Humidité absolue calculée (g/m³)',[
  // Même comparaison que la V13 d'origine : salon contre air entrant.
  // La sonde P0 reste visible dans les graphiques de température et d'humidité relative,
  // mais n'est pas mélangée à cette comparaison psychrométrique.
  seriesFor(data,'sh','Salon',COLORS[0],r=>isPlausibleTemperature(r.st)&&isPlausibleHumidity(r.sh)?absoluteHumidity(r.st,r.sh):null,r=>(Number.isFinite(r.st)&&!isPlausibleTemperature(r.st))||(Number.isFinite(r.sh)&&!isPlausibleHumidity(r.sh))),
  seriesFor(data,'he','Air entrant',COLORS[2],r=>isPlausibleTemperature(r.te)&&isPlausibleHumidity(r.he)?absoluteHumidity(r.te,r.he):null,r=>(Number.isFinite(r.te)&&!isPlausibleTemperature(r.te))||(Number.isFinite(r.he)&&!isPlausibleHumidity(r.he)))],selectedDate,$);
 drawChart('chartTemp','Températures',[
  // Composition historique V13 : salon, P0 et P1. La température extérieure
  // reste conservée dans les données mais n'élargit pas l'échelle de ce graphique.
  seriesFor(data,'st','Salon',COLORS[0],r=>isPlausibleTemperature(r.st)?r.st:null,r=>Number.isFinite(r.st)&&!isPlausibleTemperature(r.st)),
  seriesFor(data,'t1','P0 sortie résistance',COLORS[1],r=>isPlausibleTemperature(r.t1)?r.t1:null,r=>Number.isFinite(r.t1)&&!isPlausibleTemperature(r.t1)),
  seriesFor(data,'te','P1 entrée air',COLORS[2],r=>isPlausibleTemperature(r.te)?r.te:null,r=>Number.isFinite(r.te)&&!isPlausibleTemperature(r.te))],selectedDate,$);
 drawChart('chartRPM','Régime ventilateur',[seriesFor(data,'rpm','Régime',COLORS[0])],selectedDate,$);
 drawChart('chartDebit','Débit exporté VMI+ (valeur brute, unité non précisée)',[seriesFor(data,'debit','Débit exporté',COLORS[1])],selectedDate,$);
}
