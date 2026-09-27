import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { ORG_UNDER } from '../config/brand';
import { fmtDateLong } from '../lib/thai';
import { OWNER_EMAIL } from '../lib/roles';

const ORG_ADDRESS = 'โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองสนม อำเภอเมืองสกลนคร จังหวัดสกลนคร 47000';
const ORG_LONG = `โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองสนม กองสาธารณสุข ${ORG_UNDER}`;
// ผู้ตรวจสอบ/ผู้บังคับบัญชา ที่เซ็นรับรองในแบบฟอร์มลาทุกใบ (ยกเว้นช่อง "เรียน" ที่แยกตามผู้ยื่น)
const CHECKER_NAME = 'นางสาวพิไลวรรณ กุลมินทร์';
const CHECKER_POSITION = 'นักวิชาการสาธารณสุขชำนาญการ';

// เส้นประสำหรับให้กรอกด้วยลายมือ
const Blank = ({ w = 'w-40' }) => <span className={`inline-block border-b border-dotted border-slate-500 align-bottom ${w}`}>&nbsp;</span>;

// กล่อง "ความเห็นของผู้บังคับบัญชา" — เซ็นชื่อ/ตำแหน่งไว้ล่วงหน้า ยกเว้นระบุ autoDate จึงจะเติมวันที่ให้อัตโนมัติ
function SignatureBox({ role, presetName, presetPosition, autoDate }) {
  return (
    <div className="mt-4 text-sm leading-7">
      <div className="font-semibold">ความเห็นของ{role}</div>
      <div className="mt-1 border-b border-dotted border-slate-400">&nbsp;</div>
      <div className="border-b border-dotted border-slate-400">&nbsp;</div>
      <div className="mt-3">( ลงชื่อ ) <Blank w="w-56" /></div>
      <div>( {presetName || <Blank w="w-56" />} )</div>
      <div>ตำแหน่ง {presetPosition || <Blank w="w-56" />}</div>
      {autoDate ? (
        <div>วันที่ {autoDate}</div>
      ) : (
        <div>วันที่ <Blank w="w-16" /> เดือน <Blank w="w-28" /> พ.ศ. <Blank w="w-16" /></div>
      )}
    </div>
  );
}

// บรรทัดลงชื่อ "ผู้ตรวจสอบ" — เซ็นชื่อ/ตำแหน่งไว้ล่วงหน้า วันที่เติมอัตโนมัติตามวันที่เริ่มลา
function CheckerLine({ dateSrc }) {
  return (
    <div className="mt-4 text-sm leading-7">
      <div>( ลงชื่อ ) <Blank w="w-56" /> ผู้ตรวจสอบ</div>
      <div>( {CHECKER_NAME} )</div>
      <div>ตำแหน่ง {CHECKER_POSITION}</div>
      <div>วันที่ {fmtDateLong(dateSrc)}</div>
    </div>
  );
}

// คำสั่งมอบหมายงานในหน้าที่ระหว่างลา (ผู้มอบงาน/ผู้รับมอบงาน)
function DelegateBox({ l }) {
  return (
    <div className="mt-4 text-sm leading-7">
      <p>
        ในวันลาครั้งนี้ข้าพเจ้าได้มอบหมายการทำงานในหน้าที่ ให้ {l.delegateTo ? <b>{l.delegateTo}</b> : <Blank w="w-56" />}
        {l.delegatePosition ? ` (${l.delegatePosition})` : ''} เป็นผู้ดำเนินการแทน
      </p>
      <div className="mt-3 flex flex-wrap gap-x-10 gap-y-2">
        <div>
          <div>( ลงชื่อ ) <Blank w="w-48" /> ผู้มอบงาน</div>
          <div className="text-xs text-slate-500">( {l.name} )</div>
        </div>
        <div>
          <div>( ลงชื่อ ) <Blank w="w-48" /> ผู้รับมอบงาน</div>
          <div className="text-xs text-slate-500">( {l.delegateTo || '-'} )</div>
        </div>
      </div>
    </div>
  );
}

function OrderBox() {
  return (
    <div className="mt-4 rounded border border-slate-400 p-3 text-sm leading-7">
      <div className="mb-2 font-semibold">คำสั่ง</div>
      <div className="flex gap-6">
        <label className="flex items-center gap-1"><span className="inline-block h-4 w-4 border border-slate-600" /> อนุญาต</label>
        <label className="flex items-center gap-1"><span className="inline-block h-4 w-4 border border-slate-600" /> ไม่อนุญาต</label>
      </div>
      <div className="mt-2 border-b border-dotted border-slate-400">&nbsp;</div>
      <div className="mt-3">( ลงชื่อ ) <Blank w="w-56" /></div>
      <div>( <Blank w="w-56" /> )</div>
      <div>ตำแหน่ง <Blank w="w-56" /></div>
      <div>วันที่ <Blank w="w-16" /> เดือน <Blank w="w-28" /> พ.ศ. <Blank w="w-16" /></div>
    </div>
  );
}

function StatsTable({ rows }) {
  return (
    <table className="mt-3 w-full border-collapse border border-slate-500 text-sm">
      <thead>
        <tr className="bg-slate-100">
          <th className="border border-slate-500 px-2 py-1">ประเภทลา</th>
          <th className="border border-slate-500 px-2 py-1">ลามาแล้ว (วันทำการ)</th>
          <th className="border border-slate-500 px-2 py-1">ลาครั้งนี้ (วันทำการ)</th>
          <th className="border border-slate-500 px-2 py-1">รวมเป็น (วันทำการ)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.type}>
            <td className="border border-slate-500 px-2 py-1">{r.type}</td>
            <td className="border border-slate-500 px-2 py-1 text-center">{r.before || '-'}</td>
            <td className="border border-slate-500 px-2 py-1 text-center">{r.thisTime || '-'}</td>
            <td className="border border-slate-500 px-2 py-1 text-center">{r.total || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// หัวแบบฟอร์ม (ไม่มีโลโก้ รพ.สต. ตามที่ต้องการ)
function Head({ title }) {
  return (
    <div className="mb-4 flex items-start justify-between">
      <div>
        <div className="text-lg font-bold">{title}</div>
        <div className="text-sm text-slate-600">{ORG_ADDRESS}</div>
      </div>
      <div className="text-right text-sm">
        <div className="print:hidden">&nbsp;</div>
      </div>
    </div>
  );
}

// แบบใบลาป่วย / ลากิจส่วนตัว / ลาคลอดบุตร (แบบใช้ร่วมกัน มีช่องติ๊กประเภท)
function SickPersonalMaternity({ l, stats, lastSame, to }) {
  const mark = (t) => (l.type === t ? '☑' : '☐');
  return (
    <>
      <Head title="แบบใบลาป่วย ลาคลอดบุตร ลากิจส่วนตัว" />
      <div className="text-right text-sm">เขียนที่ {ORG_ADDRESS}</div>
      <div className="text-right text-sm">วันที่ {fmtDateLong(l.start)}</div>
      <p className="mt-3">เรื่อง ขอลา{l.type.replace('ลา', '')}</p>
      <p>เรียน {to}</p>
      <p className="mt-2 leading-8">
        ข้าพเจ้า {l.name} ตำแหน่ง {l.position || <Blank />} สังกัด {ORG_LONG}
      </p>
      <p className="mt-2 leading-8">
        {mark('ลาป่วย')} ลาป่วย &nbsp;&nbsp; {mark('ลากิจส่วนตัว')} ลากิจส่วนตัว เนื่องจาก {l.type === 'ลากิจส่วนตัว' ? l.reason : <Blank w="w-72" />} &nbsp;&nbsp; {mark('ลาคลอดบุตร')} ลาคลอดบุตร
      </p>
      <p className="mt-2 leading-8">
        ตั้งแต่วันที่ {fmtDateLong(l.start)} ถึงวันที่ {fmtDateLong(l.end)} มีกำหนด {l.days} วัน
      </p>
      <p className="mt-2 leading-8">
        ข้าพเจ้าได้ลา {l.type.replace('ลา', '')} ครั้งสุดท้ายตั้งแต่วันที่ {lastSame ? fmtDateLong(lastSame) : <Blank />}
      </p>
      <p className="mt-2 leading-8">ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่ {l.contact || <Blank w="w-96" />}</p>
      <div className="mt-6 text-right">
        <div>( ลงชื่อ ) <Blank w="w-56" /></div>
        <div className="mr-2">( {l.name} )</div>
        <div className="mr-2">{l.position}</div>
      </div>
      <DelegateBox l={l} />
      <SignatureBox role="ผู้บังคับบัญชา" presetName={CHECKER_NAME} presetPosition={CHECKER_POSITION} />
      <p className="mt-4 text-sm">สถิติการลาในปีงบประมาณนี้</p>
      <StatsTable rows={stats} />
      <CheckerLine dateSrc={l.start} />
      <OrderBox />
    </>
  );
}

// แบบใบลาพักผ่อน
function Vacation({ l, stats, to }) {
  return (
    <>
      <Head title="แบบใบลาพักผ่อน" />
      <div className="text-right text-sm">เขียนที่ {ORG_ADDRESS}</div>
      <div className="text-right text-sm">วันที่ {fmtDateLong(l.start)}</div>
      <p className="mt-3">เรื่อง ขอลาพักผ่อน</p>
      <p>เรียน {to}</p>
      <p className="mt-2 leading-8">
        ข้าพเจ้า {l.name} ตำแหน่ง {l.position || <Blank />} สังกัด {ORG_LONG}
      </p>
      <p className="mt-2 leading-8">
        ประสงค์ขออนุญาตลาพักผ่อนระหว่างวันที่ {fmtDateLong(l.start)} ถึงวันที่ {fmtDateLong(l.end)} รวม {l.days} วันทำการ
      </p>
      <p className="mt-2 leading-8">ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่ {l.contact || <Blank w="w-96" />}</p>
      <div className="mt-6 text-right">
        <div>( {l.name} )</div>
        <div className="mr-2">{l.position}</div>
      </div>
      <DelegateBox l={l} />
      <p className="mt-4 text-sm">สถิติการลาในปีงบประมาณนี้</p>
      <StatsTable rows={stats} />
      <SignatureBox role="ผู้บังคับบัญชา" presetName={CHECKER_NAME} presetPosition={CHECKER_POSITION} />
      <CheckerLine dateSrc={l.start} />
      <OrderBox />
    </>
  );
}

// แบบใบลาอุปสมบท / ประกอบพิธีฮัจย์
function Ordination({ l, to }) {
  return (
    <>
      <Head title={l.type.includes('ฮัจย์') ? 'แบบใบลาอุปสมบท/ประกอบพิธีฮัจย์' : 'แบบใบลาอุปสมบท'} />
      <p className="text-right text-sm">เขียนที่ {ORG_ADDRESS}</p>
      <p className="text-right text-sm">วันที่ {fmtDateLong(l.start)}</p>
      <p className="mt-3">เรื่อง ขอลาอุปสมบท/ประกอบพิธีฮัจย์</p>
      <p>เรียน {to}</p>
      <p className="mt-2 leading-8">
        ข้าพเจ้า {l.name} ตำแหน่ง {l.position || <Blank />} สังกัด {ORG_LONG}
      </p>
      <p className="mt-2 leading-8">เกิดวันที่ <Blank /> เข้ารับราชการเมื่อวันที่ <Blank /></p>
      <p className="mt-2 leading-8">ข้าพเจ้า <Blank w="w-24" /> เคยอุปสมบท/ประกอบพิธีฮัจย์มาก่อน</p>
      <p className="mt-2 leading-8">บัดนี้มีศรัทธาจะอุปสมบท/ประกอบพิธีฮัจย์ ณ <Blank w="w-96" /></p>
      <p className="mt-2 leading-8">
        จึงขออนุญาตลาตั้งแต่วันที่ {fmtDateLong(l.start)} ถึงวันที่ {fmtDateLong(l.end)} มีกำหนด {l.days} วัน
      </p>
      <p className="mt-2 leading-8">เหตุผล/รายละเอียดเพิ่มเติม {l.reason || <Blank w="w-96" />}</p>
      <div className="mt-6 text-right">
        <div>( ลงชื่อ ) <Blank w="w-56" /></div>
        <div className="mr-2">( {l.name} )</div>
      </div>
      <DelegateBox l={l} />
      <SignatureBox role="ผู้บังคับบัญชา" presetName={CHECKER_NAME} presetPosition={CHECKER_POSITION} />
      <CheckerLine dateSrc={l.start} />
      <OrderBox />
    </>
  );
}

// แบบใบลาทั่วไป (ใช้กับประเภทที่ไม่มีตัวอย่างเฉพาะ เช่น ลาไปช่วยเหลือภริยาคลอดบุตร / ลาไปศึกษาฝึกอบรม / อื่น ๆ)
function GenericLeave({ l, stats, to }) {
  return (
    <>
      <Head title={`แบบใบ${l.type}`} />
      <p className="text-right text-sm">เขียนที่ {ORG_ADDRESS}</p>
      <p className="text-right text-sm">วันที่ {fmtDateLong(l.start)}</p>
      <p className="mt-3">เรื่อง ขอ{l.type}</p>
      <p>เรียน {to}</p>
      <p className="mt-2 leading-8">
        ข้าพเจ้า {l.name} ตำแหน่ง {l.position || <Blank />} สังกัด {ORG_LONG}
      </p>
      <p className="mt-2 leading-8">เนื่องจาก {l.reason || <Blank w="w-96" />}</p>
      <p className="mt-2 leading-8">
        ตั้งแต่วันที่ {fmtDateLong(l.start)} ถึงวันที่ {fmtDateLong(l.end)} มีกำหนด {l.days} วัน
      </p>
      <p className="mt-2 leading-8">ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่ {l.contact || <Blank w="w-96" />}</p>
      <div className="mt-6 text-right">
        <div>( ลงชื่อ ) <Blank w="w-56" /></div>
        <div className="mr-2">( {l.name} )</div>
        <div className="mr-2">{l.position}</div>
      </div>
      <DelegateBox l={l} />
      <p className="mt-4 text-sm">สถิติการลาในปีงบประมาณนี้</p>
      <StatsTable rows={stats} />
      <SignatureBox role="ผู้บังคับบัญชา" presetName={CHECKER_NAME} presetPosition={CHECKER_POSITION} />
      <CheckerLine dateSrc={l.start} />
      <OrderBox />
    </>
  );
}

// หน้าที่ 2: บันทึกข้อความขอส่งใบลา — ใช้ร่วมกันทุกประเภทการลา จ่าหน้าซองตาม "to" ที่คำนวณไว้ และลงชื่อท้ายด้วยผู้ขอลาเอง
function MemoPage({ l, to, stats }) {
  const myStat = stats.find((s) => s.type === l.type) || { before: '-', total: l.days };
  return (
    <div className="mt-10 border-t-2 border-dashed border-slate-400 pt-8 print:break-before-page">
      <div className="text-center font-bold">บันทึกข้อความ</div>
      <p className="mt-2">ส่วนราชการ {ORG_UNDER} กองสาธารณสุข โรงพยาบาลส่งเสริมสุขภาพตำบลหนองสนม</p>
      <p>ที่ สน 51006.24/ <Blank w="w-24" /> &nbsp;&nbsp; วันที่ {fmtDateLong(l.start)}</p>
      <p className="mt-2">เรื่อง ขอส่งใบ{l.type}</p>
      <p>เรียน {to}</p>
      <p className="mt-2 leading-8">
        ด้วยโรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองสนม ตำบลเชียงเครือ อำเภอเมืองสกลนคร จังหวัดสกลนคร กองสาธารณสุข {ORG_UNDER}
        {' '}มีข้าราชการประสงค์ขออนุญาต{l.type} จำนวน 1 ราย คือ {l.name} ตำแหน่ง {l.position}
        {' '}ประสงค์ขออนุญาต{l.type}ระหว่างวันที่ {fmtDateLong(l.start)} ถึงวันที่ {fmtDateLong(l.end)} รวม {l.days} วันทำการ
        {' '}ลามาแล้ว {myStat.before || '-'} วันทำการ ลาครั้งนี้ {l.days} วันทำการ รวม {myStat.total || l.days} วันทำการ
      </p>
      <p className="mt-2">ทั้งนี้ในระหว่างลาได้มอบหมายให้ {l.delegateTo || <Blank w="w-56" />} ตำแหน่ง {l.delegatePosition || <Blank w="w-56" />} รับมอบงานในหน้าที่ในการปฏิบัติราชการแทน</p>
      <p className="mt-2">ในการนี้ โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองสนม กองสาธารณสุข {ORG_UNDER} จึงขอส่งใบ{l.type}ของข้าราชการรายดังกล่าว เพื่อให้{to}พิจารณาต่อไป</p>
      <p className="mt-2">จึงเรียนมาเพื่อโปรดพิจารณา</p>
      <div className="mt-8 text-right">
        <div>( {l.name} )</div>
        <div className="mr-2">{l.position}</div>
      </div>
      <p className="mt-6 text-center text-sm">&ldquo;อยู่สกล รักสกล ทำเพื่อสกลนคร&rdquo;</p>
    </div>
  );
}

export default function PrintLeave() {
  const { id } = useParams();
  const [l, setL] = useState(null);
  const [extra, setExtra] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'leaves', id)).then(async (snap) => {
      if (!snap.exists()) { setNotFound(true); return; }
      const data = { id: snap.id, ...snap.data() };
      setL(data);
      // ดึงประวัติการลาของบุคคลนี้ในปีงบประมาณเดียวกัน เพื่อคำนวณสถิติ "ลามาแล้ว" (ไม่รวมใบนี้)
      const s = await getDocs(query(collection(db, 'leaves'), where('fy', '==', data.fy), where('userEmail', '==', data.userEmail)));
      const others = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.id !== data.id && x.status === 'อนุมัติ');
      setExtra(others);
    }).catch(() => setNotFound(true));
  }, [id]);

  useEffect(() => {
    if (l && extra) setTimeout(() => window.print(), 400);
  }, [l, extra]);

  if (notFound) return <div className="p-8 text-center">ไม่พบใบลานี้</div>;
  if (!l || !extra) return <div className="p-8 text-center text-slate-500">กำลังโหลดข้อมูล...</div>;

  const STAT_TYPES = ['ลาป่วย', 'ลากิจส่วนตัว', 'ลาคลอดบุตร'];
  const stats = STAT_TYPES.map((type) => {
    const before = extra.filter((x) => x.type === type).reduce((s2, x) => s2 + (Number(x.days) || 0), 0);
    const thisTime = l.type === type ? Number(l.days) || 0 : 0;
    return { type, before: before || '', thisTime: thisTime || '', total: (before + thisTime) || '' };
  });
  if (!STAT_TYPES.includes(l.type)) {
    const before = extra.filter((x) => x.type === l.type).reduce((s2, x) => s2 + (Number(x.days) || 0), 0);
    stats.push({ type: l.type, before: before || '', thisTime: l.days, total: before + Number(l.days || 0) });
  }
  const prevSame = extra.filter((x) => x.type === l.type && x.end < l.start).sort((a, b) => b.end.localeCompare(a.end))[0];
  // ทุกคนเรียนถึงผู้อำนวยการ รพ.สต. ยกเว้นใบลาของผู้อำนวยการเองที่ต้องส่งขึ้นไปที่กองสาธารณสุข
  const to = l.userEmail === OWNER_EMAIL ? 'ผู้อำนวยการกองสาธารณสุข' : 'ผู้อำนวยการโรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองสนม';

  return (
    <div className="mx-auto max-w-[800px] bg-white p-8 text-[15px] leading-6 text-slate-800 print:p-0">
      <div className="mb-3 flex justify-end gap-2 print:hidden">
        <button className="btn btn-outline" onClick={() => window.close()}>ปิดหน้านี้</button>
        <button className="btn btn-primary" onClick={() => window.print()}>พิมพ์ / บันทึกเป็น PDF</button>
      </div>
      {['ลาป่วย', 'ลากิจส่วนตัว', 'ลาคลอดบุตร'].includes(l.type) ? (
        <SickPersonalMaternity l={l} stats={stats} lastSame={prevSame?.end} to={to} />
      ) : l.type === 'ลาพักผ่อน' ? (
        <Vacation l={l} stats={stats} to={to} />
      ) : l.type === 'ลาอุปสมบท/ประกอบพิธีฮัจย์' ? (
        <Ordination l={l} to={to} />
      ) : (
        <GenericLeave l={l} stats={stats} to={to} />
      )}
      {/* แผ่นที่ 2: บันทึกข้อความขอส่งใบลา ใช้ร่วมกันทุกประเภทการลา */}
      <MemoPage l={l} to={to} stats={stats} />
    </div>
  );
}
