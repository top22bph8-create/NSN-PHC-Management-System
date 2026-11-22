// พิมพ์ "แบบฟอร์มการตรวจสุขภาพประชาชน (15 ปีขึ้นไป)" เป็นหลักฐานหลังคัดกรอง — หน้า A4 แนวตั้ง 2 ฟอร์ม/หน้า (เหมือนต้นฉบับ)
// กรอกข้อมูลจากผลคัดกรองที่บันทึกในระบบ · เปิดหน้าต่างพิมพ์แล้วบันทึกเป็น PDF ได้ · blank=true พิมพ์ฟอร์มเปล่า
import { DM_SYM } from './ncdScreen';
import { escH } from './surveyPrint';
import { fmtDate } from './thai';

const fyBE = (d) => { const s = String(d || ''); if (!/^\d{4}-\d{2}/.test(s)) return ''; const y = Number(s.slice(0, 4)); return (Number(s.slice(5, 7)) >= 10 ? y + 1 : y) + 543; };
const cb = (on) => `<i class="cb${on ? ' on' : ''}">${on ? '✓' : ''}</i>`;
const rd = (on) => `<i class="rd${on ? ' on' : ''}"></i>`;
const dots = (v, w = 60) => `<u class="dt" style="min-width:${w}px">${v === '' || v == null ? '&nbsp;' : escH(v)}</u>`;
const yn = (known, val) => (known ? `${rd(val === true)} มี &nbsp; ${rd(val === false)} ไม่มี` : `${rd(false)} มี &nbsp; ${rd(false)} ไม่มี`);

function formHtml(r, blank) {
  const R = blank ? {} : r;
  const age = R.age ?? '';
  const g15 = R.ageGroup === '15-34'; const g35 = R.ageGroup === '35-59';
  const dm = Array.isArray(R.dmSym); const has = (k) => dm && R.dmSym.includes(k);
  const q = (k) => `<div class="sy"><span>${DM_SYM.findIndex((x) => x[0] === k) + 1}. ${DM_SYM.find((x) => x[0] === k)[1]}</span><span class="yn">${yn(dm, has(k))}</span></div>`;
  const known = !blank;
  const sbp1 = R.sbp1 ?? ''; const dbp1 = R.dbp1 ?? ''; const sbp2 = R.sbp2 ?? ''; const dbp2 = R.dbp2 ?? '';
  const bp = (a, b) => (a === '' && b === '' ? '' : `${a}/${b}`);
  const mood = R.q2a === true || R.q2b === true || R.q2a === false;
  return `<div class="fm">
<div class="t1"><b>แบบฟอร์มการตรวจสุขภาพประชาชน (15 ปีขึ้นไป)</b> รพ.สต.บ้านหนองสนม <b>ปีงบประมาณ ${blank ? '2570' : fyBE(R.screenDate) || '2570'}</b> &nbsp; วันที่ตรวจ ${dots(blank ? '' : fmtDate(R.screenDate), 110)}</div>
<div class="bar"><div class="bx1">${cb(g15)} 15-34 ปี &nbsp; ${cb(g35)} 35-59 ปี</div><div class="bx1">${cb(R.sex === 'M')} ชาย &nbsp; ${cb(R.sex === 'F')} หญิง</div><div class="bx1 w">โทร ${dots(blank ? '' : (R.phone || R.authen?.phone || ''), 80)}</div><div class="bx1">${cb(!blank && R.authen?.status === 'opened')} Authen แล้ว &nbsp; ${cb(!blank && R.jhcis === 'done')} ลง jhcis แล้ว</div></div>
<div class="ln"><span>เลขบัตรประชาชน ${dots(blank ? '' : R.cid, 150)}</span><span>ชื่อ-สกุล ${dots(blank ? '' : R.name, 200)}</span><span>อายุ ${dots(age, 40)} ปี</span></div>
<div class="ln"><span>บ้านเลขที่ ${dots(blank ? '' : R.houseNo, 50)}</span><span>หมู่ที่ ${dots(blank ? '' : R.villageNo, 36)}</span><span>ต. ${dots(blank ? '' : (R.tambon || 'เชียงเครือ'), 90)}</span><span>น้ำหนัก ${dots(R.weight ?? '', 44)} กก.</span><span>ส่วนสูง ${dots(R.height ?? '', 44)} ซม.</span><span>รอบเอว ${dots(R.waist ?? '', 44)} ซม.</span></div>
<div class="ln"><span><b>ความดันโลหิต (ครั้งที่ 1)</b> ${dots(blank ? '' : bp(sbp1, dbp1), 80)} mmHg</span><span><b>(ครั้งที่ 2)</b> ${dots(blank ? '' : bp(sbp2, dbp2), 80)} mmHg</span><span><b>ชีพจร</b> ${dots(R.pulse ?? '', 50)} ครั้ง/นาที</span></div>
<div class="bd"><div class="rw"><b>1) ท่านมีอาการต่อไปนี้หรือไม่ ?</b> บิดา-มารดา พี่-น้องสายตรง ป่วยด้วยโรคเบาหวาน <span class="yn">${yn(known, R.familyDM === true ? true : (known ? false : undefined))}</span></div>
<div class="g2"><div>${['foot', 'thirst', 'nocturia', 'eatthin'].map(q).join('')}</div><div>${['lip', 'numb', 'knee', 'wtloss'].map(q).join('')}</div></div></div>
<div class="bd rw"><b>2) ท่านสูบบุหรี่หรือไม่?</b> ${rd(R.smokeStatus === 'never')} ไม่สูบ &nbsp; ${rd(R.smokeStatus === 'former')} เคยสูบแต่เลิกแล้ว &nbsp; ${rd(R.smokeStatus === 'current')} สูบ จำนวนที่สูบ ${dots(R.smokePerDay ?? '', 40)} มวล/วัน ระยะเวลาที่สูบ ${dots(R.smokeYears ?? '', 36)} ปี</div>
<div class="bd rw"><b>3) ท่านดื่มเครื่องดื่มแอลกอฮอล์หรือไม่?</b> ${rd(R.alcoholFreq === 'none')} ไม่ดื่ม ${rd(R.alcoholFreq === 'former')} เคยดื่มแต่เลิกแล้ว ${rd(R.alcoholFreq === 'sometimes')} นานๆ ดื่มครั้ง (ตามเทศกาล) ${rd(R.alcoholFreq === 'regular')} ดื่ม ${dots(R.alcoholPerWeek ?? '', 30)} ครั้ง/สัปดาห์</div>
<div class="bd"><div class="rw"><b>4) ในระยะ 1 เดือนที่ผ่านมา ท่านมีอารมณ์เหล่านี้หรือไม่?</b> ${rd(mood && R.q2a === false && R.q2b === false)} ไม่มีอาการดังกล่าว</div>
<div class="ind">${rd(R.q2a === true)} รู้สึกหดหู่ เศร้าหรือท้อแท้ สิ้นหวัง</div><div class="ind">${rd(R.q2b === true)} เบื่อหน่าย ทำอะไรก็ไม่เพลิดเพลิน</div></div>
<div class="bd"><div class="rw"><b>5) การตรวจประเมินความเสี่ยงต่อการเกิดโรคเบาหวาน</b></div>
<div class="rw">${cb(!blank && R.glucose !== '' && R.glucose != null)} เจาะเลือดปลายนิ้ว = ${dots(R.glucose ?? '', 80)} mg% &nbsp; ${rd(!blank && R.glucose !== '' && R.glucose != null && R.fasting !== false)} งดอาหาร &nbsp; ${rd(!blank && R.glucose !== '' && R.glucose != null && R.fasting === false)} ไม่งดอาหาร</div></div>
<div class="ft">${blank ? 'ผู้คัดกรอง ........................................' : `ผู้คัดกรอง: ${escH(R.screenedBy || R.asmName || '-')}${R.review === 'approved' ? ' · เจ้าหน้าที่ตรวจสอบแล้ว' : ''} · พิมพ์จากระบบ รพ.สต.บ้านหนองสนม`}</div>
</div>`;
}

export function openNcdFormPrint(rows, { blank = false } = {}) {
  const list = blank ? [{}, {}] : rows;
  if (!list.length) { window.alert('ไม่มีรายการให้พิมพ์'); return; }
  const w = window.open('', '_blank');
  if (!w) { window.alert('เบราว์เซอร์บล็อกหน้าต่างใหม่ — กรุณาอนุญาตป๊อปอัปสำหรับเว็บนี้แล้วกดอีกครั้ง'); return; }
  const pages = [];
  for (let i = 0; i < list.length; i += 2) pages.push(`<section class="pg">${formHtml(list[i], blank)}${list[i + 1] ? formHtml(list[i + 1], blank) : '<div class="fm"></div>'}</section>`);
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>แบบฟอร์มการตรวจสุขภาพประชาชน (15 ปีขึ้นไป)${blank ? ' (ฟอร์มเปล่า)' : ''}</title><style>
@page{size:A4 portrait;margin:8mm}
*{box-sizing:border-box}body{font-family:'Sarabun','TH Sarabun New','Noto Sans Thai',Tahoma,sans-serif;font-size:11.5px;color:#000;margin:0;line-height:1.45}
.pg{page-break-after:always;height:281mm;display:flex;flex-direction:column;gap:4mm}.pg:last-child{page-break-after:auto}
.fm{flex:1;min-width:0;display:flex;flex-direction:column;gap:2.2mm;border-bottom:1px dashed #666;padding-bottom:3mm;min-height:0;overflow:hidden}.fm:last-child{border-bottom:0}
.t1{font-size:12.5px}.bar{display:flex;gap:5px;font-size:11px}.bx1{border:1.4px solid #000;border-radius:5px;padding:3px 6px;white-space:nowrap}.bx1.w{flex:1;min-width:0;overflow:hidden}
.ln{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline}
u.dt{text-decoration:none;border-bottom:1px dotted #000;display:inline-block;padding:0 3px;text-align:center;font-weight:600}
.bd{border:1.4px solid #000;padding:2px 6px}.rw{padding:1.5px 0}.g2{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #000}.g2>div:first-child{border-right:1px solid #000}
.sy{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:2px 6px;border-bottom:1px solid #000}.g2>div .sy:last-child{border-bottom:0}.yn{white-space:nowrap;margin-left:auto;padding-left:6px}
.ind{padding:1px 0 1px 40px}
i.cb{display:inline-block;width:12px;height:12px;border:1.4px solid #000;vertical-align:-2px;text-align:center;font-style:normal;font-size:10px;line-height:10px;font-weight:700}
i.rd{display:inline-block;width:12px;height:12px;border:1.4px solid #000;border-radius:50%;vertical-align:-2px;position:relative}i.rd.on::after{content:'';position:absolute;inset:2px;background:#000;border-radius:50%}
.ft{margin-top:auto;font-size:10px;color:#333}
@media print{html{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>${pages.join('')}<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>`);
  w.document.close();
}
