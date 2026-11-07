// สถิติสำหรับการศึกษาเชิงวิเคราะห์ (ตาราง 2x2): OR (case-control) / RR (cohort) พร้อม 95% CI และ chi-square
// a = สัมผัส+ป่วย, b = สัมผัส+ไม่ป่วย, c = ไม่สัมผัส+ป่วย, d = ไม่สัมผัส+ไม่ป่วย
const erfc = (x) => { const z = Math.abs(x); const t = 1 / (1 + 0.5 * z); const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; };
export function twoByTwo(design, a, b, c, d) {
  const n = [a, b, c, d].map((x) => Number(x)); if (n.some((x) => !isFinite(x) || x < 0)) return null;
  const [A, B, C, D] = n; const N = A + B + C + D; if (!N) return null;
  const zero = [A, B, C, D].some((x) => x === 0); const k = zero ? 0.5 : 0; const [a1, b1, c1, d1] = [A + k, B + k, C + k, D + k];
  const out = { zero, N, expN: A + B, unexpN: C + D, attackExp: A + B ? (A / (A + B)) * 100 : null, attackUnexp: C + D ? (C / (C + D)) * 100 : null, caseExp: A + C ? (A / (A + C)) * 100 : null, ctlExp: B + D ? (B / (B + D)) * 100 : null };
  const row1 = A + B; const row2 = C + D; const col1 = A + C; const col2 = B + D;
  const chi = row1 && row2 && col1 && col2 ? (N * (A * D - B * C) ** 2) / (row1 * row2 * col1 * col2) : null;
  out.chi = chi; out.p = chi == null ? null : erfc(Math.sqrt(chi / 2));
  if (design === 'cohort') {
    const rr = (a1 / (a1 + b1)) / (c1 / (c1 + d1)); const se = Math.sqrt(1 / a1 - 1 / (a1 + b1) + 1 / c1 - 1 / (c1 + d1));
    out.measure = 'RR'; out.est = rr; out.lo = Math.exp(Math.log(rr) - 1.96 * se); out.hi = Math.exp(Math.log(rr) + 1.96 * se);
  } else {
    const or = (a1 * d1) / (b1 * c1); const se = Math.sqrt(1 / a1 + 1 / b1 + 1 / c1 + 1 / d1);
    out.measure = 'OR'; out.est = or; out.lo = Math.exp(Math.log(or) - 1.96 * se); out.hi = Math.exp(Math.log(or) + 1.96 * se);
  }
  return out;
}
export const f2 = (x) => (x == null || !isFinite(x) ? '-' : Number(x).toFixed(2));
export const fp = (p) => (p == null ? '-' : p < 0.001 ? '<0.001' : p.toFixed(3));
