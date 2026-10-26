// Lattice — nonogram logic shared by the game (window.LS) and the build tools (require).
// A grid is a flat array, row-major: 0 = empty, 1..C = a colour. A clue is a list of [length, colour] runs.
// Knowledge about a cell is a bitmask: bit 0 = "could be empty", bit c = "could be colour c".
(function(root){
'use strict';

function clueOf(line){const out=[];let i=0;const n=line.length;
 while(i<n){const c=line[i];if(!c){i++;continue;}let j=i;while(j<n&&line[j]===c)j++;out.push([j-i,c]);i=j;}return out;}
function cluesOf(g,w,h){const rows=[],cols=[];
 for(let y=0;y<h;y++)rows.push(clueOf(g.slice(y*w,y*w+w)));
 for(let x=0;x<w;x++){const l=[];for(let y=0;y<h;y++)l.push(g[y*w+x]);cols.push(clueOf(l));}
 return{rows,cols};}

// Every arrangement of the runs that fits the known cells, intersected. Returns the narrowed masks, or null on a contradiction.
function solveLine(clue,m){const n=m.length,k=clue.length;
 const F=[],B=[];for(let i=0;i<=n;i++){F.push(new Uint8Array(k+1));B.push(new Uint8Array(k+1));}
 // bad[c][i]: cells in [0,i) that cannot be colour c
 const cols=new Set(clue.map(b=>b[1])),bad={};
 for(const c of cols){const a=new Uint16Array(n+1),bit=1<<c;for(let i=0;i<n;i++)a[i+1]=a[i]+((m[i]&bit)?0:1);bad[c]=a;}
 const ok=(c,s,e)=>e<=n&&bad[c][e]-bad[c][s]===0;
 // where block j placed at i lands next; -1 if impossible
 const tgt=(i,j)=>{const[len,c]=clue[j],e=i+len;if(!ok(c,i,e))return -1;
  if(j+1<k&&clue[j+1][1]===c){return(e<n&&(m[e]&1))?e+1:-1;}return e;};
 F[0][0]=1;
 for(let i=0;i<=n;i++)for(let j=0;j<=k;j++){if(!F[i][j])continue;
  if(i<n&&(m[i]&1))F[i+1][j]=1;
  if(j<k){const t=tgt(i,j);if(t>=0)F[t][j+1]=1;}}
 if(!F[n][k])return null;
 B[n][k]=1;
 for(let i=n;i>=0;i--)for(let j=k;j>=0;j--){if(i===n&&j===k)continue;let v=0;
  if(i<n&&(m[i]&1)&&B[i+1][j])v=1;
  if(!v&&j<k){const t=tgt(i,j);if(t>=0&&B[t][j+1])v=1;}
  B[i][j]=v;}
 const r=new Uint32Array(n);
 for(let i=0;i<=n;i++)for(let j=0;j<=k;j++){if(!F[i][j])continue;
  if(i<n&&(m[i]&1)&&B[i+1][j])r[i]|=1;
  if(j<k){const t=tgt(i,j);if(t>=0&&B[t][j+1]){const[len,c]=clue[j],bit=1<<c;for(let q=i;q<i+len;q++)r[q]|=bit;if(t===i+len+1)r[i+len]|=1;}}}
 for(let i=0;i<n;i++)if(!r[i])return null;
 return r;}

const pop=v=>{let c=0;while(v){v&=v-1;c++;}return c;};
const lowbit=v=>{let i=0;while(!(v&1)){v>>=1;i++;}return i;};// mask with one bit -> value

// Line-solve the whole grid from `masks` (modified in place). Returns {ok, solved, steps}.
function propagate(cl,w,h,masks,dirty){
 const qr=new Uint8Array(h),qc=new Uint8Array(w),Q=[];
 const push=(t,i)=>{if(t===0){if(!qr[i]){qr[i]=1;Q.push(i);}}else if(!qc[i]){qc[i]=1;Q.push(~i);}};
 if(dirty){for(const i of dirty){push(0,(i/w)|0);push(1,i%w);}}else{for(let y=0;y<h;y++)push(0,y);for(let x=0;x<w;x++)push(1,x);}
 let steps=0;
 while(Q.length){const q=Q.shift();steps++;
  if(q>=0){const y=q;qr[y]=0;const line=masks.slice(y*w,y*w+w),r=solveLine(cl.rows[y],line);if(!r)return{ok:false};
   for(let x=0;x<w;x++)if(r[x]!==line[x]){masks[y*w+x]=r[x];push(1,x);}}
  else{const x=~q;qc[x]=0;const line=new Uint32Array(h);for(let y=0;y<h;y++)line[y]=masks[y*w+x];const r=solveLine(cl.cols[x],line);if(!r)return{ok:false};
   for(let y=0;y<h;y++)if(r[y]!==line[y]){masks[y*w+x]=r[y];push(0,y);}}}
 let solved=true;for(let i=0;i<masks.length;i++)if(pop(masks[i])!==1){solved=false;break;}
 return{ok:true,solved,steps};}

function fullMask(C){let m=1;for(let c=1;c<=C;c++)m|=1<<c;return m;}
function maxColour(g){let C=1;for(const v of g)if(v>C)C=v;return C;}

// Fresh masks with the givens already placed.
function startMasks(g,w,h,C,givens){const all=fullMask(C),m=new Uint32Array(w*h).fill(all);
 if(givens)for(const i of givens)m[i]=1<<g[i];return m;}

// Fewest revealed cells that make the picture solvable line by line (greedy: each reveal is the cell that unlocks the most).
function findGivens(g,w,h,opts){opts=opts||{};const C=maxColour(g),cl=cluesOf(g,w,h),givens=[];
 let m=startMasks(g,w,h,C,givens);let r=propagate(cl,w,h,m);if(!r.ok)throw new Error('contradiction');
 const known=x=>{let k=0;for(let i=0;i<x.length;i++)if(pop(x[i])===1)k++;return k;};
 const rnd=opts.rng||Math.random,limit=opts.sample||80;
 while(!r.solved){const und=[];for(let i=0;i<m.length;i++)if(pop(m[i])>1)und.push(i);
  // a filled cell teaches more than an empty one; sample when the board is big
  let cand=und;if(cand.length>limit){cand=und.slice().sort(()=>rnd()-.5).slice(0,limit);}
  let best=-1,bi=cand[0];
  for(const i of cand){const t=m.slice();t[i]=1<<g[i];const rr=propagate(cl,w,h,t,[i]);const s=known(t)+(g[i]?.5:0);if(s>best){best=s;bi=i;}}
  givens.push(bi);m[bi]=1<<g[bi];r=propagate(cl,w,h,m,[bi]);if(givens.length>opts.max)return null;}
 return givens;}

// The cell values a fully solved mask set implies.
function maskToGrid(m){return Array.from(m,v=>lowbit(v));}

// Hint: from the player's correct marks only, find a line where logic decides something new.
// state[i]: -1 unknown, 0 crossed, c filled with colour c. Returns {kind:'mistake',cells} or {kind:'line',axis,index,cells} or null.
function hint(g,w,h,state,clues){const C=maxColour(g),all=fullMask(C),cl=clues||cluesOf(g,w,h);
 const wrong=[];for(let i=0;i<g.length;i++){const s=state[i];if(s>0&&s!==g[i])wrong.push(i);else if(s===0&&g[i])wrong.push(i);}
 if(wrong.length)return{kind:'mistake',cells:wrong};
 const m=new Uint32Array(w*h);for(let i=0;i<m.length;i++)m[i]=state[i]<0?all:1<<state[i];
 const lines=[];
 for(let y=0;y<h;y++){const line=m.slice(y*w,y*w+w),r=solveLine(cl.rows[y],line);if(!r)continue;const cells=[];for(let x=0;x<w;x++)if(pop(r[x])===1&&pop(line[x])>1)cells.push(y*w+x);if(cells.length)lines.push({kind:'line',axis:'row',index:y,cells});}
 for(let x=0;x<w;x++){const line=new Uint32Array(h);for(let y=0;y<h;y++)line[y]=m[y*w+x];const r=solveLine(cl.cols[x],line);if(!r)continue;const cells=[];for(let y=0;y<h;y++)if(pop(r[y])===1&&pop(line[y])>1)cells.push(y*w+x);if(cells.length)lines.push({kind:'line',axis:'col',index:x,cells});}
 if(!lines.length){// stuck on line logic alone (a puzzle that needs its givens): point at any unknown cell
  for(let i=0;i<g.length;i++)if(state[i]<0&&g[i])return{kind:'cell',cells:[i]};return null;}
 // the line with the most to give, so a hint always feels worth asking for
 lines.sort((a,b)=>b.cells.length-a.cells.length);return lines[0];}

// ---- procedural pictures for Endless and the Daily -------------------------------------------
function rng(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
function hashStr(t){let h=2166136261;for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}

// Value noise on a coarse lattice, bilinear: low-frequency fields give large, calm regions
function field(w,h,R,cellSz){const gw=Math.ceil(w/cellSz)+2,gh=Math.ceil(h/cellSz)+2,v=[];for(let i=0;i<gw*gh;i++)v.push(R());
 const out=new Float64Array(w*h),ox=R()*cellSz,oy=R()*cellSz;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const fx=(x+ox)/cellSz,fy=(y+oy)/cellSz,ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy;
  const sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty),a=v[iy*gw+ix],b=v[iy*gw+ix+1],c=v[(iy+1)*gw+ix],d=v[(iy+1)*gw+ix+1];
  out[y*w+x]=(a*(1-sx)+b*sx)*(1-sy)+(c*(1-sx)+d*sx)*sy;}return out;}
// A motif: two octaves of noise, often mirrored, cut into shape and coloured by a slower field.
// Reads as a tile, an emblem or a creature rather than static.
function motif(w,h,R,colours){const g=new Array(w*h).fill(0),sym=R()<.75,big=Math.max(w,h);
 const f1=field(w,h,R,Math.max(3,big/4.2)),f2=field(w,h,R,Math.max(2,big/9));
 let a=new Array(w*h);const sh=new Float64Array(w*h);for(let i=0;i<sh.length;i++)sh[i]=f1[i]*.72+f2[i]*.28;
 if(sym)for(let y=0;y<h;y++)for(let x=0;x<w>>1;x++)sh[y*w+(w-1-x)]=sh[y*w+x];
 const sorted=Array.from(sh).sort((p,q)=>p-q),cut=sorted[Math.floor(sorted.length*(.38+R()*.2))];
 for(let i=0;i<a.length;i++)a[i]=sh[i]>=cut?1:0;
 // one smoothing pass removes lone pixels
 const b=a.slice();for(let y=0;y<h;y++)for(let x=0;x<w;x++){let n=0,t=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const yy=y+dy,xx=x+dx;if(yy<0||xx<0||yy>=h||xx>=w)continue;t++;n+=a[yy*w+xx];}
  const i=y*w+x;if(n<=1)b[i]=0;else if(n>=t-1)b[i]=1;}a=b;
 if(colours>1){const fc=field(w,h,R,Math.max(3,big/3.2));if(sym)for(let y=0;y<h;y++)for(let x=0;x<w>>1;x++)fc[y*w+(w-1-x)]=fc[y*w+x];
  const vals=[];for(let i=0;i<g.length;i++)if(a[i])vals.push(fc[i]);vals.sort((p,q)=>p-q);
  const cuts=[];for(let c=1;c<colours;c++)cuts.push(vals[Math.floor(vals.length*c/colours)]);
  for(let i=0;i<g.length;i++)if(a[i]){let c=1;for(const t of cuts)if(fc[i]>=t)c++;g[i]=c;}}
 else for(let i=0;i<g.length;i++)g[i]=a[i];
 return g;}

// How busy the clues are: average runs per line. Calm pictures read better and play better.
function busyness(g,w,h){const cl=cluesOf(g,w,h);let n=0;for(const r of cl.rows)n+=r.length;for(const c of cl.cols)n+=c.length;return n/(w+h);}

// A procedural puzzle that is solvable by logic alone, or with a few givens if the dice won't cooperate.
function generate(w,h,seed,colours){const R=rng(seed);colours=colours||1;let best=null,bestScore=1e9,fallback=null;
 const target=1.6+Math.max(w,h)/9+(colours-1)*.9;
 for(let tries=0;tries<24;tries++){const g=motif(w,h,R,colours);let filled=0;for(const v of g)if(v)filled++;
  if(filled<w*h*.3||filled>w*h*.78)continue;
  const C=maxColour(g),cl=cluesOf(g,w,h),m=startMasks(g,w,h,C),r=propagate(cl,w,h,m);const score=Math.abs(busyness(g,w,h)-target);
  if(r.ok&&r.solved){if(score<bestScore){best={g,givens:[]};bestScore=score;}if(score<.35)break;}
  else if(!fallback)fallback=g;}
 if(best)return best;const g=fallback||motif(w,h,R,colours);return{g,givens:findGivens(g,w,h,{rng:R,sample:30})};}

const api={busyness,motif,clueOf,cluesOf,solveLine,propagate,startMasks,findGivens,maskToGrid,hint,generate,rng,hashStr,maxColour,fullMask,pop};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LS=api;
})(typeof self!=='undefined'?self:this);
