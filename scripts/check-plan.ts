import { occurrencesBetween } from "../src/lib/plan";
import { monthRange } from "../src/lib/dates";

let fails = 0;
function eq(label: string, got: string[], want: string[]) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}\n     got  ${got.join(",")}\n     want ${want.join(",")}`);
}
const m = (month: string) => monthRange(month);

eq("único no mês", occurrencesBetween({ startDay: "2026-09-10", recurrence: "NONE", endDay: null }, m("2026-09").from, m("2026-09").to), ["2026-09-10"]);
eq("único fora do mês", occurrencesBetween({ startDay: "2026-09-10", recurrence: "NONE", endDay: null }, m("2026-10").from, m("2026-10").to), []);
eq("semanal set", occurrencesBetween({ startDay: "2026-09-03", recurrence: "WEEKLY", endDay: null }, m("2026-09").from, m("2026-09").to), ["2026-09-03","2026-09-10","2026-09-17","2026-09-24"]);
eq("semanal out (fase mantida)", occurrencesBetween({ startDay: "2026-09-03", recurrence: "WEEKLY", endDay: null }, m("2026-10").from, m("2026-10").to), ["2026-10-01","2026-10-08","2026-10-15","2026-10-22","2026-10-29"]);
eq("quinzenal out", occurrencesBetween({ startDay: "2026-09-05", recurrence: "BIWEEKLY", endDay: null }, m("2026-10").from, m("2026-10").to), ["2026-10-03","2026-10-17","2026-10-31"]);
eq("mensal dia 12", occurrencesBetween({ startDay: "2026-09-12", recurrence: "MONTHLY", endDay: null }, m("2027-03").from, m("2027-03").to), ["2027-03-12"]);
eq("mensal dia 31 em fev", occurrencesBetween({ startDay: "2026-09-30", recurrence: "MONTHLY", endDay: null }, m("2027-02").from, m("2027-02").to), ["2027-02-28"]);
eq("mensal dia 31 volta em mar", occurrencesBetween({ startDay: "2026-08-31", recurrence: "MONTHLY", endDay: null }, m("2027-03").from, m("2027-03").to), ["2027-03-31"]);
eq("mensal dia 31 em set (mês de 30)", occurrencesBetween({ startDay: "2026-08-31", recurrence: "MONTHLY", endDay: null }, m("2026-09").from, m("2026-09").to), ["2026-09-30"]);
eq("fim corta", occurrencesBetween({ startDay: "2026-09-03", recurrence: "WEEKLY", endDay: "2026-09-17" }, m("2026-09").from, m("2026-09").to), ["2026-09-03","2026-09-10","2026-09-17"]);
eq("fim no passado", occurrencesBetween({ startDay: "2026-09-03", recurrence: "WEEKLY", endDay: "2026-09-17" }, m("2026-10").from, m("2026-10").to), []);
eq("mês anterior ao início", occurrencesBetween({ startDay: "2026-09-12", recurrence: "MONTHLY", endDay: null }, m("2026-08").from, m("2026-08").to), []);
eq("mensal começando dia 1", occurrencesBetween({ startDay: "2026-09-01", recurrence: "MONTHLY", endDay: null }, m("2026-12").from, m("2026-12").to), ["2026-12-01"]);

console.log(fails ? `\n${fails} falha(s)` : "\ntudo certo");
process.exit(fails ? 1 : 0);
