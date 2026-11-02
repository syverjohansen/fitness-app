export const MI=1609.344
export function distance(m=0,unit='mi'){return unit==='km'?`${(m/1000).toFixed(1)} km`:`${(m/MI).toFixed(1)} mi`}
export function duration(s=0){const h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=Math.round(s%60);return h?`${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`:`${m}:${String(sec).padStart(2,'0')}`}
export function pace(secPerM=0,unit='mi'){if(!Number.isFinite(secPerM)||secPerM<=0)return '—';const n=secPerM*(unit==='km'?1000:MI);return `${Math.floor(n/60)}:${String(Math.round(n)%60).padStart(2,'0')} /${unit}`}
export function shortDate(s:string){return new Date(`${s}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric'})}
export function longDate(s:string){return new Date(`${s}T12:00:00`).toLocaleDateString(undefined,{weekday:'short',month:'long',day:'numeric',year:'numeric'})}
