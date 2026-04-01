// src/utils/descriptionParser.js

export function parseDescription(desc = "") {
    if (!desc) {
        return { summary: "", packages: [], meta: [], notes: [], stats: {} };
    }

    const text = desc.replace(/\r/g, "");

    //  TYPE DETECTION
    const isLinux =
        text.includes(".rpm") || text.includes("Target RPMs");
    const isUbuntu = text.includes(".deb");
    const isWindows =
        text.toLowerCase().includes("windows") ||
        text.includes("KB") ||
        text.includes("Microsoft");

    if (isLinux || isUbuntu) return parseLinux(text);
    if (isWindows) return parseWindows(text);

    return parseGeneric(text);
}

//
// LINUX / RHEL / UBUNTU PARSER
//
function parseLinux(text) {
    
    let normalized = text
        .replace(/Target RPMs/g, "\nTarget RPMs\n")
        .replace(/Target \.deb files:/gi, "\nTarget DEB\n");

    const [before, after] = normalized.split(/Target RPMs|Target DEB/);

    const summary = (before || "").trim();

    let packages = [];
    let rest = after || "";

    
    const pkgRegex = /([a-zA-Z0-9._+-]+?\.(rpm|deb))/g;

    let match;
    while ((match = pkgRegex.exec(rest)) !== null) {
        packages.push(match[1]);
    }

    // Remove packages from text
    packages.forEach((pkg) => {
        rest = rest.replace(pkg, "");
    });

    return buildCommon(rest, summary, packages);
}

//
//  WINDOWS PARSER
//
function parseWindows(text) {
    let summary = "";
    let packages = [];
    let rest = text;

    // Extract KB IDs
    const kbMatches = text.match(/KB\d{6,}/gi);
    if (kbMatches) {
        packages = [...new Set(kbMatches)];
    }

    // First sentence as summary
    const firstLine = text.split(/\n|\./)[0];
    summary = firstLine?.trim() || "";

    return buildCommon(rest, summary, packages);
}

//
//  GENERIC FALLBACK
//
function parseGeneric(text) {
    return buildCommon(text, "", []);
}

//
// COMMON PARSER (SHARED LOGIC)
//

function buildCommon(text, summary, packages) {
  const normalized = text
    .replace(/\.([A-Z])/g, ". $1")
    .replace(/(Note:)/g, "\nNote:")
    .replace(/(CVE:)/g, "\nCVE:")
    .replace(/(Number of)/g, "\nNumber of")
    .replace(/(Total Target File Size:)/g, "\n$1")
    .replace(/(File Size:)/g, "\n$1")
    .replace(/(Download Size:)/g, "\n$1");

  const lines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let meta = [];
  let notes = [];
  let stats = {
    fileCount: "",
    fileSize: "",
    cves: [],
  };

  lines.forEach((line) => {
    const lower = line.toLowerCase();

    // NOTES (ONLY true notes)
    if (lower.startsWith("note:")) {
      notes.push(line.replace(/^Note:\s*/i, ""));
      return;
    }

    // FILE COUNT
    if (lower.startsWith("number of")) {
      const match = line.match(/(\d+)/);
      if (match) stats.fileCount = match[1];
      return;
    }

    // FILE SIZE / DOWNLOAD SIZE
    if (
      lower.includes("file size") ||
      lower.includes("download size")
    ) {
      const match = line.match(/([\d.]+\s?[A-Z]+)/);
      if (match) stats.fileSize = match[1];
      return;
    }

    // CVEs
    const cveMatches = line.match(/CVE-\d{4}-\d+/gi);
    if (cveMatches) {
      stats.cves.push(...cveMatches);
      return;
    }

    //META 
    if (
      !lower.startsWith("note:") &&
      !lower.includes("file size") &&
      !lower.includes("download size") &&
      !lower.includes("number of") &&
      !lower.match(/cve-\d{4}-\d+/i)
    ) {
      meta.push(line);
    }
  });

  // remove duplicate CVEs
  stats.cves = [...new Set(stats.cves)];

  return {
    summary,
    packages,
    meta,
    notes,
    stats,
  };
}