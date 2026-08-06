import { copyFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const threatSourcePath = path.join(projectRoot, "app/app/immunity-threats.ts");
const iconMetadataPath = path.join(projectRoot, "node_modules/@tabler/icons/icons.json");
const iconSourceDir = path.join(projectRoot, "node_modules/@tabler/icons/icons/outline");
const outputDir = path.join(projectRoot, "public/immunity/threat-icons");

const threatSource = await readFile(threatSourcePath, "utf8");
const threats = [...threatSource.matchAll(/^\s*"((?:\\.|[^"\\])*)",?\s*$/gm)].map((match) =>
  JSON.parse(`"${match[1]}"`),
);
const sortedThreats = [...threats].sort((a, b) =>
  a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }),
);

const metadata = JSON.parse(await readFile(iconMetadataPath, "utf8"));
const allowedCategories = new Set([
  "Animals",
  "Badges",
  "Charts",
  "Communication",
  "Computers",
  "Database",
  "Development",
  "Devices",
  "Document",
  "E-commerce",
  "Electrical",
  "Logic",
  "Map",
  "Media",
  "Photography",
  "Shapes",
  "Symbols",
  "System",
  "Vehicles",
  "Version control",
  "Weather",
]);
const rejectedName = /(?:^brand-|(?:^|-)off$|(?:^|-)filled$|^letter-|^number-|^square-letter-|^circle-letter-|^square-number-|^circle-number-|^mood-|^zodiac-|^gender-|^currency-)/;

const icons = Object.entries(metadata)
  .filter(([name, icon]) =>
    icon.styles?.outline &&
    allowedCategories.has(icon.category) &&
    !rejectedName.test(name) &&
    existsSync(path.join(iconSourceDir, `${name}.svg`)),
  )
  .map(([name, icon]) => ({
    name,
    category: icon.category,
    tags: [...new Set([name, ...(icon.tags ?? [])].map((tag) => String(tag).toLowerCase()))],
  }));

const themes = [
  {
    match: /trojan|rat\b|malware|loader|rootkit|spyware|stealer|keylogger|worm|botnet|backdoor/i,
    categories: ["Development", "Computers", "System", "Animals"],
    terms: ["bug", "skull", "horse", "spider", "cat", "dog", "fish", "ghost", "mask", "robot", "antenna", "device", "binary", "cpu"],
  },
  {
    match: /phish|email|mail|attachment|spoof|social engineering|evil twin/i,
    categories: ["Communication", "Document", "Computers"],
    terms: ["mail", "message", "fish", "hook", "paperclip", "link", "qrcode", "inbox", "at", "send"],
  },
  {
    match: /auth|authorization|access|privilege|credential|token|session|identity|password|account|oauth/i,
    categories: ["System", "Badges", "Devices", "Development"],
    terms: ["shield", "lock", "key", "fingerprint", "user", "id", "password", "badge", "door", "login", "certificate"],
  },
  {
    match: /injection|code|xss|script|rce|execution|overflow|deserializ|xxe|exploit|vulnerab|cve|zero.?day|shell|command/i,
    categories: ["Development", "Computers", "System", "Document"],
    terms: ["code", "bracket", "terminal", "script", "file-code", "binary", "api", "bug", "alert", "crash", "braces"],
  },
  {
    match: /ransom|locker|encrypt|crypto|secret|certificate|key/i,
    categories: ["System", "Document", "Database"],
    terms: ["lock", "key", "file-lock", "folder", "database", "shield", "skull", "safe", "vault"],
  },
  {
    match: /cloud|metadata|iam|s3|lambda|azure|aws|gcp|serverless/i,
    categories: ["Computers", "Database", "Devices"],
    terms: ["cloud", "server", "database", "network", "affiliate", "world", "stack", "container"],
  },
  {
    match: /dns|network|c2|command-and-control|tunnel|proxy|vpn|hijack|arp|bgp|wifi|wireless|router/i,
    categories: ["Computers", "Devices", "Communication", "Map"],
    terms: ["network", "topology", "route", "wifi", "antenna", "world", "globe", "satellite", "router", "broadcast"],
  },
  {
    match: /supply|dependency|package|npm|pypi|nuget|docker|container|build|pipeline/i,
    categories: ["Development", "Version control", "System"],
    terms: ["package", "box", "git", "container", "assembly", "stack", "archive", "versions", "hierarchy"],
  },
  {
    match: /data|sql|database|exfiltration|dump|clipboard|browser|storage/i,
    categories: ["Database", "Document", "Computers", "Charts"],
    terms: ["database", "table", "file", "binary", "harddisk", "archive", "clipboard", "cloud-data", "chart", "schema"],
  },
  {
    match: /ddos|denial|flood|amplification|wiper|destruction|impact|fraud/i,
    categories: ["System", "Symbols", "Weather"],
    terms: ["flame", "bomb", "bolt", "alert", "eraser", "trash", "skull", "waves", "storm", "ban"],
  },
  {
    match: /android|ios|mobile|iphone|apk/i,
    categories: ["Devices", "System"],
    terms: ["device-mobile", "device-tablet", "apps", "phone", "fingerprint", "antenna", "wifi"],
  },
];

const normalizedWords = (value) =>
  value
    .toLowerCase()
    .replace(/cve-\d{4}-\d+/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !["the", "and", "for", "with", "attack", "malware"].includes(word));

const hashText = (value) => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/* Reserve the most visible catalog entries and user-reported collisions for
   literal, threat-appropriate artwork. The scored matcher handles the rest. */
const manualIcons = new Map([
  ["0mega", "target-arrow"],
  ["3PARA RAT", "terminal-2"],
  ["4H RAT", "spider"],
  ["8Base", "shield-bolt"],
  ["AADInternals", "binary-tree"],
  ["ABK", "cloud-lock"],
  ["Abyss Locker", "shield-lock"],
  ["ACAD/Medre.A", "file-code-2"],
  ["Accellion FTA SQL Injection (CVE-2021-27101)", "database-exclamation"],
  ["Access Token Theft", "user-key"],
  ["Account Manipulation", "user-cog"],
  ["Account Takeover", "user-shield"],
  ["AcidPour", "droplet-bolt"],
  ["AcidRain", "cloud-storm"],
  ["Action RAT", "device-desktop-bolt"],
  ["Active Scanning", "radar"],
  ["Ad Fraud", "ad-circle-off"],
  ["adbupd", "device-mobile-code"],
  ["AdFind", "search"],
  ["ADRecon", "binoculars"],
  ["Adversary-in-the-Middle", "arrows-exchange"],
  ["Adware Distribution", "ad"],
  ["Agenda Ransomware", "calendar-bolt"],
  ["Agent Smith", "users"],
  ["Agent Tesla", "bolt"],
  ["Agent.btz", "bug"],
  ["Confluence Auth Bypass (CVE-2023-22515)", "auth-2fa"],
  ["Confluence Data Center RCE (CVE-2023-22527)", "server-bolt"],
  ["Confluence OGNL Injection (CVE-2022-26134)", "brackets-angle"],
]);
const reservedIcons = new Set(manualIcons.values());

const used = new Set();
const assignments = [];

for (const [index, threat] of sortedThreats.entries()) {
  const manualIcon = manualIcons.get(threat);
  if (manualIcon) {
    const iconData = metadata[manualIcon];
    const icon = iconData?.styles?.outline && existsSync(path.join(iconSourceDir, `${manualIcon}.svg`))
      ? { name: manualIcon, category: iconData.category }
      : null;
    if (!icon) throw new Error(`Reserved icon ${manualIcon} is unavailable for ${threat}`);
    used.add(icon.name);
    assignments.push({ index, threat, icon: icon.name, category: icon.category });
    continue;
  }

  const words = normalizedWords(threat);
  const theme = themes.find(({ match }) => match.test(threat));
  const threatHash = hashText(threat);
  let best = null;

  for (const icon of icons) {
    if (used.has(icon.name) || reservedIcons.has(icon.name)) continue;

    const searchable = `${icon.name} ${icon.tags.join(" ")}`;
    let score = 0;

    for (const word of words) {
      if (icon.name === word) score += 180;
      else if (icon.name.includes(word)) score += 80;
      else if (searchable.includes(word)) score += 34;
    }

    if (theme) {
      if (theme.categories.includes(icon.category)) score += 38;
      for (const term of theme.terms) {
        if (icon.name === term) score += 96;
        else if (icon.name.includes(term)) score += 52;
        else if (searchable.includes(term)) score += 18;
      }
    } else if (["System", "Development", "Computers", "Devices"].includes(icon.category)) {
      score += 20;
    }

    const tieBreak = hashText(`${threatHash}:${icon.name}`) / 0xffffffff;
    const rank = score + tieBreak;
    if (!best || rank > best.rank) best = { ...icon, rank };
  }

  if (!best) throw new Error(`No unique icon available for ${threat}`);
  used.add(best.name);
  assignments.push({ index, threat, icon: best.name, category: best.category });
}

await mkdir(outputDir, { recursive: true });
await Promise.all(
  assignments.map(({ index, icon }) =>
    copyFile(
      path.join(iconSourceDir, `${icon}.svg`),
      path.join(outputDir, `threat-${String(index).padStart(4, "0")}.svg`),
    ),
  ),
);

const duplicateCount = assignments.length - new Set(assignments.map(({ icon }) => icon)).size;
const confluence = assignments.filter(({ threat }) => /confluence/i.test(threat));
console.log(JSON.stringify({
  threats: assignments.length,
  candidates: icons.length,
  duplicateCount,
  confluence,
  sample: assignments.slice(0, 16),
}, null, 2));
