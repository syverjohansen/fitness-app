export interface FitnessMark { id:string; label:string; distanceM:number; time:string }
export interface FitnessProfile { prs:FitnessMark[]; current:FitnessMark[]; goals:FitnessMark[] }

export const DEFAULT_FITNESS_PROFILE:FitnessProfile={
  prs:[
    {id:'pr-mile',label:'Mile',distanceM:1609,time:'4:40'},
    {id:'pr-3k',label:'3000 m',distanceM:3000,time:'9:33'},
    {id:'pr-5k',label:'5000 m',distanceM:5000,time:'16:26.74'},
    {id:'pr-5mi',label:'5 miles',distanceM:8045,time:'27:20'},
    {id:'pr-10mi',label:'10 miles',distanceM:16090,time:'58:12'},
    {id:'pr-half',label:'Half marathon',distanceM:21097.5,time:'1:18:30'},
    {id:'pr-marathon',label:'Marathon',distanceM:42195,time:'2:49:26'},
  ],
  current:[{id:'current-5mi',label:'5 miles',distanceM:8045,time:'28:00'}],
  goals:[{id:'goal-5mi',label:'5 miles',distanceM:8045,time:'27:00'}],
}

export function parseRaceTime(value:string):number{const p=value.trim().split(':').map(Number);if(!p.length||p.some(x=>!Number.isFinite(x)||x<0))return NaN;if(p.length===1)return p[0];if(p.length===2)return p[0]*60+p[1];if(p.length===3)return p[0]*3600+p[1]*60+p[2];return NaN}
export function formatRaceTime(seconds:number,tenths=false):string{if(!Number.isFinite(seconds)||seconds<0)return'—';const n=tenths?Math.round(seconds*10)/10:Math.round(seconds),h=Math.floor(n/3600),m=Math.floor((n-h*3600)/60),s=n-h*3600-m*60,ss=tenths&&Math.abs(s-Math.round(s))>.001?s.toFixed(1).padStart(4,'0'):String(Math.round(s)).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${ss}`:`${m}:${ss}`}

type Point={distanceM:number;timeS:number}
const points=(marks:FitnessMark[]):Point[]=>marks.map(m=>({distanceM:Number(m.distanceM),timeS:parseRaceTime(m.time)})).filter(m=>m.distanceM>0&&m.timeS>0&&Number.isFinite(m.timeS)).sort((a,b)=>a.distanceM-b.distanceM)
function segmentFor(distanceM:number,prs:Point[]):[Point,Point]{if(distanceM<=prs[0].distanceM)return[prs[0],prs[1]];if(distanceM>=prs.at(-1)!.distanceM)return[prs.at(-2)!,prs.at(-1)!];const upper=prs.findIndex(p=>p.distanceM>=distanceM);return[prs[upper-1],prs[upper]]}
export function personalPerformanceAt(distanceM:number,marks:FitnessMark[]):number{const prs=points(marks);if(!distanceM||!prs.length)return NaN;if(prs.length===1)return prs[0].timeS*Math.pow(distanceM/prs[0].distanceM,1.06);const exact=prs.find(p=>Math.abs(p.distanceM-distanceM)<.01);if(exact)return exact.timeS;const[a,b]=segmentFor(distanceM,prs),exponent=Math.log(b.timeS/a.timeS)/Math.log(b.distanceM/a.distanceM);return a.timeS*Math.pow(distanceM/a.distanceM,exponent)}
export function personalExponent(fromM:number,toM:number,marks:FitnessMark[]):number{if(Math.abs(fromM-toM)<.01)return 1;const a=personalPerformanceAt(fromM,marks),b=personalPerformanceAt(toM,marks);if(!Number.isFinite(a)||!Number.isFinite(b))return 1.06;return Math.log(b/a)/Math.log(toM/fromM)}
export function equivalentTime(anchorDistanceM:number,anchorTimeS:number,targetDistanceM:number,marks:FitnessMark[]){const exponent=personalExponent(anchorDistanceM,targetDistanceM,marks);return{exponent,timeS:anchorTimeS*Math.pow(targetDistanceM/anchorDistanceM,exponent)}}
export function thresholdEquivalentDistanceM(repMinutes:number):number{return(repMinutes<=6?repMinutes*5:30*Math.pow(repMinutes/6,.667))*1000}
export function thresholdTarget(anchorDistanceM:number,anchorTimeS:number,repMinutes:number,marks:FitnessMark[]){const targetM=thresholdEquivalentDistanceM(repMinutes),prs=points(marks);let exponent=1.06;if(prs.length>=2){const[lower,upper]=segmentFor(targetM,prs),lowB=personalExponent(anchorDistanceM,lower.distanceM,marks),highB=personalExponent(anchorDistanceM,upper.distanceM,marks),weight=(Math.log(targetM)-Math.log(lower.distanceM))/(Math.log(upper.distanceM)-Math.log(lower.distanceM));exponent=lowB+weight*(highB-lowB)}const equivalentTimeS=anchorTimeS*Math.pow(targetM/anchorDistanceM,exponent);return{targetM,exponent,equivalentTimeS,paceSecPerKm:equivalentTimeS/(targetM/1000)}}
