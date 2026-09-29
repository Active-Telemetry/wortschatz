#!/usr/bin/env node
/*
  Validates words.js.

    node validate-words.js                 offline checks
    node validate-words.js --online        also checks every word against de.wiktionary.org (Node 18+)

  Online options:
    --pos=n,v,adj     only check these parts of speech (n v adj adv pron prep conj num phrase)
    --word=Kind       only check one lemma
    --refresh         ignore the local cache (.wiktionary-cache.json)
    --verbose         also print words that passed with notes

  What --online checks for every row (lemma looked up on de.wiktionary.org, German section only):
    - the word exists                                      (phrases: info only)
    - part of speech matches (Substantiv, Verb, ...)       WARN
    - nouns: article vs Genus                              ERROR
    - nouns: plural vs "Nominativ Plural"                  ERROR / WARN / info (see below)
    - English translations overlap Wiktionary's {{Ü|en}}   WARN
  Put reviewed, deliberate differences into WIKI_ACCEPTED below to silence them.
  Exit code 1 if any ERROR.
*/
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
const flag = (n) => args.includes("--" + n);
const opt = (n) => { const a = args.find((x) => x.startsWith("--" + n + "=")); return a ? a.slice(n.length + 3) : null; };
const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");

const { WORDS, CAT_LABELS } = new Function(read("words.js") + "\nreturn { WORDS, CAT_LABELS };")();

let errors = 0, warns = 0;
const err = (m) => { errors++; console.log("ERROR  " + m); };
const warn = (m) => { warns++; console.log("WARN   " + m); };
const info = (m) => console.log("info   " + m);
const formsOf = (v) => (typeof v === "string" && v !== "=" ? v.split("|") : []);

/* Reviewed differences to Wiktionary: lemma -> reason. */
const WIKI_ACCEPTED = {
  // Balkon: "Balkone|Balkons": both accepted here, Wiktionary lists both
  Europa: "Wiktionary lists Genus=f",
  China: "Wiktionary lists Genus=f",
  Verwandten: "Wiktionary lists Deklinierte Form",
  welches: "Wiktionary lists Deklinierte Form",
};

/* =====================  1. OFFLINE STRUCTURE CHECKS  ===================== */
console.log(`\n== Structure (${WORDS.length} rows) ==`);
const ARTICLES = ["der", "die", "das"];
const POS = ["n", "v", "adj", "adv", "pron", "prep", "conj", "num", "phrase"];
const byKey = new Map();
for (const w of WORDS) {
  if (!POS.includes(w.pos)) err(`${w.id}: unknown pos "${w.pos}"`);
  if (!CAT_LABELS[w.cat]) err(`${w.id}: unknown category "${w.cat}"`);
  if (!(w.level >= 1 && w.level <= 5)) err(`${w.id}: level ${w.level} not in 1-5`);
  if (!w.en.length || w.en.some((e) => !String(e).trim())) err(`${w.id}: empty English translation`);
  if (w.pos === "n") {
    if (!ARTICLES.includes(w.article)) err(`${w.id}: noun without valid article`);
    const x = w.extra;
    if (!x) { err(`${w.id}: noun has no extra ({ pl } / { plOnly })`); continue; }
    const keys = Object.keys(x);
    if (keys.some((k) => k !== "pl" && k !== "plOnly")) err(`${w.id}: unknown extra keys ${keys.join(",")}`);
    if (x.plOnly) { if (w.article !== "die") err(`${w.id}: plOnly but article is "${w.article}"`); }
    else if (!("pl" in x)) err(`${w.id}: extra needs pl or plOnly`);
    else for (const f of formsOf(x.pl)) if (!/^[A-ZÄÖÜ]/.test(f)) err(`${w.id}: plural "${f}" must start with a capital`);
  } else if (w.article) err(`${w.id}: non-noun with article`);
  const k = `${w.pos}|${w.de}`;
  if (byKey.has(k)) {
    const o = byKey.get(k);
    if (JSON.stringify(o.extra) !== JSON.stringify(w.extra) || o.article !== w.article)
      warn(`${w.de}: listed twice (${o.id}, ${w.id}) with different article/extra`);
  } else byKey.set(k, w);
}
const nouns = WORDS.filter((w) => w.pos === "n");
const cnt = { plural: 0, none: 0, only: 0 };
for (const w of nouns) w.plural === null ? cnt.none++ : w.plural === "=" ? cnt.only++ : cnt.plural++;
info(`nouns: ${nouns.length} (${cnt.plural} with plural, ${cnt.none} no plural, ${cnt.only} plural-only)`);

/* =====================  2. DE.WIKTIONARY.ORG  ===================== */
function parseNounTemplates(sec) {
  const res = [];
  for (const t of sec.matchAll(/\{\{Deutsch [^\n|{}]*Übersicht([\s\S]*?)\n\s*\}\}/g)) {
    const o = { genus: [], plurals: [] };
    for (const m of t[1].matchAll(/^[ \t]*\|[ \t]*(Genus(?: \d)?|Nominativ Plural(?: \d)?)[ \t]*=[ \t]*(.*?)[ \t]*$/gm)) {
      const val = m[2].replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, "").replace(/\[\[|\]\]/g, "").trim();
      if (m[1].startsWith("Genus")) { if (val) o.genus.push(val); }
      else if (val && val !== "—" && val !== "-") o.plurals.push(val);
    }
    res.push(o);
  }
  return res;
}

function extractInfo(content) {
  const m = /^==[ \t]*[^=\n]*\(\{\{Sprache\|Deutsch\}\}\)[ \t]*==[ \t]*$/m.exec(content);
  if (!m) return { de: false };
  const rest = content.slice(m.index + m[0].length);
  const next = /^==[^=\n]/m.exec(rest);
  const sec = next ? rest.slice(0, next.index) : rest;
  const uniq = (a) => [...new Set(a)];
  return {
    de: true,
    wortarten: uniq([...sec.matchAll(/\{\{Wortart\|([^|}]+)\|Deutsch\}\}/g)].map((x) => x[1].trim())),
    nouns: parseNounTemplates(sec),
    en: uniq([...sec.matchAll(/\{\{Ü(?:xx4)?\|en\|([^}|]+)/g)].map((x) => x[1].trim())),
  };
}

const POS_OK = {
  n: /^(Substantiv|Toponym|Eigenname|Nachname|Vorname|Abkürzung)/,
  v: /^(Verb|Hilfsverb|Modalverb)/,
  adj: /^(Adjektiv|Partizip|Farbadjektiv)/,
  adv: /adverb|partikel|adjektiv|pronomen|präposition|konjunktion|numerale|interjektion/i,
  pron: /pronomen|artikel|numerale|substantiv/i,
  prep: /präposition/i,
  conj: /konjunktion|subjunktion/i,
  num: /numerale|adjektiv|zahl|substantiv/i,
};

const candidates = (w) => {
  const c = [w.de];
  const lower = w.de[0].toLowerCase() + w.de.slice(1);
  if (w.pos !== "n" && lower !== w.de) c.push(lower);
  if (w.de.startsWith("sich ")) c.push(w.de.slice(5));
  return [...new Set(c)];
};

const normEn = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, "").replace(/^(to|the|a|an)\s+/, "").replace(/\s+/g, " ").trim();

async function fetchBatch(titles) {
  const url = "https://de.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main" +
    "&format=json&formatversion=2&redirects=1&titles=" + encodeURIComponent(titles.join("|"));
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "wortschatz-validator/1.0 (personal vocabulary project)" } });
      if (res.status === 429) {
        throw new Error("HTTP 429 Too Many Requests");
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (e) {
      if (attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 4000 * attempt));
    }
  }
}

async function online() {
  console.log("\n== de.wiktionary.org ==");
  const CACHE = path.join(__dirname, ".wiktionary-cache.json");
  let cache = {};
  if (!flag("refresh") && fs.existsSync(CACHE)) { try { cache = JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch (e) {} }

  let list = WORDS;
  const posFilter = opt("pos"), only = opt("word");
  if (posFilter) list = list.filter((w) => posFilter.split(",").includes(w.pos));
  if (only) list = list.filter((w) => w.de === only);

  const need = [...new Set(list.flatMap(candidates))].filter((t) => !(t in cache));
  info(`${list.length} rows, ${need.length} pages to fetch (${Object.keys(cache).length} cached)`);

  for (let i = 0; i < need.length; i += 5) {
    const batch = need.slice(i, i + 5);
    const json = await fetchBatch(batch);
    const norm = Object.fromEntries((json.query.normalized || []).map((n) => [n.from, n.to]));
    const redir = Object.fromEntries((json.query.redirects || []).map((r) => [r.from, r.to]));
    const pages = Object.fromEntries((json.query.pages || []).map((p) => [p.title, p]));
    for (const t of batch) {
      let x = norm[t] || t; x = redir[x] || x;
      const p = pages[x];
      const content = p && !p.missing && p.revisions && p.revisions[0].slots.main.content;
      cache[t] = content ? extractInfo(content) : { de: false, missing: true };
    }
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    process.stdout.write(`\r   fetched ${Math.min(i + 5, need.length)}/${need.length}   `);
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (need.length) process.stdout.write("\n");

  const gender = { der: "m", die: "f", das: "n" };
  const stat = { ok: 0, notFound: 0, phraseNotFound: 0, pos: 0, gender: 0, plural: 0, en: 0 };
  for (const w of list) {
    if (WIKI_ACCEPTED[w.de]) continue;
    const infoObj = candidates(w).map((t) => cache[t]).find((i) => i && i.de);
    if (!infoObj) {
      if (w.pos === "phrase") { stat.phraseNotFound++; if (flag("verbose")) info(`${w.de}: phrase, no Wiktionary entry`); }
      else { stat.notFound++; warn(`${w.id} "${w.de}": no German entry found on de.wiktionary.org`); }
      continue;
    }
    let bad = false;
    const okPos = POS_OK[w.pos];
    if (okPos && !infoObj.wortarten.some((a) => okPos.test(a))) {
      stat.pos++; bad = true;
      warn(`${w.id}: part of speech "${w.pos}" but Wiktionary lists ${infoObj.wortarten.join(", ") || "(none)"}`);
    }
    if (w.pos === "n") {
      const genera = infoObj.nouns.flatMap((t) => t.genus).join("");
      const wiki = [...new Set(infoObj.nouns.flatMap((t) => t.plurals))];
      if (w.plural !== "=" && genera && !genera.includes(gender[w.article])) {
        stat.gender++; bad = true;
        err(`${w.id}: article "${w.article}" but Wiktionary Genus=${genera}`);
      }
      if (!infoObj.nouns.length) { if (flag("verbose")) info(`${w.id}: no noun table on Wiktionary, plural not checked`); }
      else if (w.plural === null) {
        if (wiki.length && flag("verbose")) info(`${w.id}: we say no plural; Wiktionary lists ${wiki.join(", ")}`);
      } else if (w.plural === "=") {
        if (!wiki.includes(w.de)) { stat.plural++; bad = true; warn(`${w.id}: marked plural-only; Wiktionary plural is ${wiki.join(", ") || "(none)"}`); }
      } else if (!wiki.length) {
        stat.plural++; bad = true; warn(`${w.id}: we say "${w.plural}"; Wiktionary lists no plural`);
      } else {
        const ours = formsOf(w.plural);
        if (!ours.some((f) => wiki.includes(f))) { stat.plural++; bad = true; err(`${w.id}: plural "${w.plural}" but Wiktionary lists ${wiki.join(", ")}`); }
        else if (!ours.every((f) => wiki.includes(f))) { stat.plural++; bad = true; warn(`${w.id}: plural "${w.plural}"; Wiktionary lists ${wiki.join(", ")}`); }
      }
    }
    if (w.pos !== "phrase" && infoObj.en.length) {
      const wikiEn = infoObj.en.map(normEn);
      if (!w.en.map(normEn).some((e) => wikiEn.includes(e))) {
        stat.en++; bad = true;
        warn(`${w.id}: English ${JSON.stringify(w.en)} not among Wiktionary translations: ${infoObj.en.slice(0, 6).join(", ")}`);
      }
    }
    if (!bad) stat.ok++;
  }
  info(`Wiktionary summary: ${stat.ok} clean | not found ${stat.notFound} (+${stat.phraseNotFound} phrases) | pos ${stat.pos} | gender ${stat.gender} | plural ${stat.plural} | English ${stat.en}`);
}

(async () => {
  if (flag("online")) {
    try { await online(); } catch (e) { warn("online check failed: " + e.message); }
  } else console.log("\n(add --online to verify every word against de.wiktionary.org)");
  console.log(`\n${errors} error(s), ${warns} warning(s)`);
  process.exit(errors ? 1 : 0);
})();
