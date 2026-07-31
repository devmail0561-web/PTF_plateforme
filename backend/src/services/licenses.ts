// ── PTF License Catalog ───────────────────────────────────────────────────────
// Three categories:
//   "osi"          — OSI-approved open-source (https://opensource.org/licenses)
//   "free"         — FSF-approved free, not necessarily OSI (https://www.gnu.org/licenses)
//   "source"       — Source-available / shared-source (not free / not OSI)
//   "proprietary"  — Proprietary / All-rights-reserved
//
// githubKey: lowercase identifier used by the GitHub Licenses API (/licenses/{key}).
//   null  → GitHub cannot auto-create this license; a template is generated locally.

export type LicenseCategory = "osi" | "free" | "source" | "proprietary";

export interface LicenseEntry {
  spdxId:          string;
  name:            string;
  category:        LicenseCategory;
  isOsi:           boolean;
  isFsf:           boolean;
  gplCompatible:   boolean;
  reputationEligible: boolean; // true for osi + free categories
  description:     string;
  url:             string;
  githubKey:       string | null;
}

// ── OSI-approved ──────────────────────────────────────────────────────────────
const OSI: Omit<LicenseEntry, "spdxId" | "name" | "description" | "url" | "githubKey" | "gplCompatible"> = {
  category: "osi", isOsi: true, isFsf: true, reputationEligible: true,
};

// ── FSF-free only (not OSI) ───────────────────────────────────────────────────
const FREE: Omit<LicenseEntry, "spdxId" | "name" | "description" | "url" | "githubKey" | "gplCompatible"> = {
  category: "free", isOsi: false, isFsf: true, reputationEligible: true,
};

// ── Source-available ──────────────────────────────────────────────────────────
const SOURCE: Omit<LicenseEntry, "spdxId" | "name" | "description" | "url" | "githubKey" | "gplCompatible"> = {
  category: "source", isOsi: false, isFsf: false, reputationEligible: false,
};

// ── Proprietary ───────────────────────────────────────────────────────────────
const PROP: Omit<LicenseEntry, "spdxId" | "name" | "description" | "url" | "githubKey" | "gplCompatible"> = {
  category: "proprietary", isOsi: false, isFsf: false, reputationEligible: false,
};

export const LICENSE_CATALOG: LicenseEntry[] = [
  // ── Permissive OSI ───────────────────────────────────────────────────────────
  { ...OSI, spdxId: "MIT",          name: "MIT License",                      gplCompatible: true,  url: "https://spdx.org/licenses/MIT.html",           githubKey: "mit",           description: "Courte et permissive. Permet usage commercial, modification, distribution." },
  { ...OSI, spdxId: "Apache-2.0",   name: "Apache License 2.0",               gplCompatible: true,  url: "https://spdx.org/licenses/Apache-2.0.html",    githubKey: "apache-2.0",    description: "Permissive avec clause de protection des marques et brevets." },
  { ...OSI, spdxId: "BSD-2-Clause", name: 'BSD 2-Clause "Simplified" License',gplCompatible: true,  url: "https://spdx.org/licenses/BSD-2-Clause.html",  githubKey: "bsd-2-clause",  description: "Permissive, deux clauses : redistribution avec mention d'auteur." },
  { ...OSI, spdxId: "BSD-3-Clause", name: 'BSD 3-Clause "New" License',       gplCompatible: true,  url: "https://spdx.org/licenses/BSD-3-Clause.html",  githubKey: "bsd-3-clause",  description: "Comme BSD-2 + clause interdisant l'utilisation du nom de l'auteur." },
  { ...OSI, spdxId: "BSD-4-Clause", name: "BSD 4-Clause License",             gplCompatible: false, url: "https://spdx.org/licenses/BSD-4-Clause.html",  githubKey: null,            description: "BSD original avec clause publicitaire (déconseillé, incompatible GPL)." },
  { ...OSI, spdxId: "ISC",          name: "ISC License",                      gplCompatible: true,  url: "https://spdx.org/licenses/ISC.html",           githubKey: "isc",           description: "Fonctionnellement équivalente à MIT. Utilisée par OpenBSD." },
  { ...OSI, spdxId: "Zlib",         name: "zlib License",                     gplCompatible: true,  url: "https://spdx.org/licenses/Zlib.html",          githubKey: null,            description: "Permissive. Utilisée par zlib, libpng." },
  { ...OSI, spdxId: "Artistic-2.0", name: "Artistic License 2.0",             gplCompatible: true,  url: "https://spdx.org/licenses/Artistic-2.0.html",  githubKey: null,            description: "Permissive avec clauses de distribution. Utilisée par Perl." },
  { ...OSI, spdxId: "PSF-2.0",      name: "Python Software Foundation License 2.0", gplCompatible: true, url: "https://spdx.org/licenses/PSF-2.0.html", githubKey: null,            description: "Licence permissive de Python. Compatible GPL." },
  { ...OSI, spdxId: "BSL-1.0",      name: "Boost Software License 1.0",       gplCompatible: true,  url: "https://spdx.org/licenses/BSL-1.0.html",      githubKey: "bsl-1.0",       description: "Permissive. Utilisée par Boost C++." },
  { ...OSI, spdxId: "0BSD",         name: "BSD Zero Clause License",           gplCompatible: true,  url: "https://spdx.org/licenses/0BSD.html",          githubKey: null,            description: "Domaine public effectif — aucune obligation de mention." },
  { ...OSI, spdxId: "UPL-1.0",      name: "Universal Permissive License v1.0", gplCompatible: true, url: "https://spdx.org/licenses/UPL-1.0.html",       githubKey: "upl-1.0",       description: "Permissive. Permet SPDX-ID dans les en-têtes de fichiers." },

  // ── Copyleft OSI ─────────────────────────────────────────────────────────────
  { ...OSI, spdxId: "GPL-2.0-only", name: "GNU General Public License v2.0 only",      gplCompatible: true,  url: "https://spdx.org/licenses/GPL-2.0-only.html",    githubKey: "gpl-2.0",  description: "Copyleft fort. Les dérivés doivent être sous GPL-2.0." },
  { ...OSI, spdxId: "GPL-2.0-or-later", name: "GNU GPL v2.0 or later",                 gplCompatible: true,  url: "https://spdx.org/licenses/GPL-2.0-or-later.html",githubKey: "gpl-2.0",  description: "Copyleft fort. Permet les versions ultérieures de la GPL." },
  { ...OSI, spdxId: "GPL-3.0-only", name: "GNU General Public License v3.0 only",      gplCompatible: true,  url: "https://spdx.org/licenses/GPL-3.0-only.html",    githubKey: "gpl-3.0",  description: "Copyleft fort. Protège contre la tivoïsation." },
  { ...OSI, spdxId: "GPL-3.0-or-later", name: "GNU GPL v3.0 or later",                 gplCompatible: true,  url: "https://spdx.org/licenses/GPL-3.0-or-later.html",githubKey: "gpl-3.0",  description: "Copyleft fort, version ou ultérieure." },
  { ...OSI, spdxId: "LGPL-2.1-only", name: "GNU Lesser GPL v2.1 only",                 gplCompatible: true,  url: "https://spdx.org/licenses/LGPL-2.1-only.html",   githubKey: "lgpl-2.1", description: "Copyleft faible. Permet l'inclusion dans des projets non-GPL." },
  { ...OSI, spdxId: "LGPL-2.1-or-later", name: "GNU LGPL v2.1 or later",               gplCompatible: true,  url: "https://spdx.org/licenses/LGPL-2.1-or-later.html",githubKey: "lgpl-2.1",description: "Copyleft faible, version ou ultérieure." },
  { ...OSI, spdxId: "LGPL-3.0-only", name: "GNU Lesser GPL v3.0 only",                 gplCompatible: true,  url: "https://spdx.org/licenses/LGPL-3.0-only.html",   githubKey: "lgpl-3.0-only", description: "Copyleft faible version 3." },
  { ...OSI, spdxId: "LGPL-3.0-or-later", name: "GNU LGPL v3.0 or later",               gplCompatible: true,  url: "https://spdx.org/licenses/LGPL-3.0-or-later.html",githubKey: null,      description: "Copyleft faible, version ou ultérieure." },
  { ...OSI, spdxId: "AGPL-3.0-only", name: "GNU Affero GPL v3.0 only",                 gplCompatible: true,  url: "https://spdx.org/licenses/AGPL-3.0-only.html",   githubKey: "agpl-3.0", description: "Copyleft réseau — couvre les applications SaaS/serveur." },
  { ...OSI, spdxId: "AGPL-3.0-or-later", name: "GNU AGPL v3.0 or later",               gplCompatible: true,  url: "https://spdx.org/licenses/AGPL-3.0-or-later.html",githubKey: "agpl-3.0",description: "Copyleft réseau, version ou ultérieure." },
  { ...OSI, spdxId: "MPL-2.0",      name: "Mozilla Public License 2.0",                gplCompatible: true,  url: "https://spdx.org/licenses/MPL-2.0.html",         githubKey: "mpl-2.0",  description: "Copyleft par fichier. Peut coexister avec du code propriétaire." },
  { ...OSI, spdxId: "EPL-1.0",      name: "Eclipse Public License 1.0",                gplCompatible: false, url: "https://spdx.org/licenses/EPL-1.0.html",         githubKey: null,       description: "Copyleft par fichier. Utilisé par Eclipse IDE." },
  { ...OSI, spdxId: "EPL-2.0",      name: "Eclipse Public License 2.0",                gplCompatible: false, url: "https://spdx.org/licenses/EPL-2.0.html",         githubKey: "epl-2.0",  description: "Version 2 de l'EPL." },
  { ...OSI, spdxId: "CDDL-1.0",     name: "Common Development & Distribution License 1.0", gplCompatible: false, url: "https://spdx.org/licenses/CDDL-1.0.html",  githubKey: null,       description: "Copyleft par fichier. Utilisé par OpenSolaris." },
  { ...OSI, spdxId: "EUPL-1.1",     name: "European Union Public License 1.1",          gplCompatible: true,  url: "https://spdx.org/licenses/EUPL-1.1.html",        githubKey: null,       description: "Copyleft européen. Compatible GPL via clause de compatibilité." },
  { ...OSI, spdxId: "EUPL-1.2",     name: "European Union Public License 1.2",          gplCompatible: true,  url: "https://spdx.org/licenses/EUPL-1.2.html",        githubKey: null,       description: "Version 1.2 de l'EUPL." },
  { ...OSI, spdxId: "OSL-3.0",      name: "Open Software License 3.0",                  gplCompatible: false, url: "https://spdx.org/licenses/OSL-3.0.html",         githubKey: "osl-3.0",  description: "Copyleft réseau fort. Résilié automatiquement en cas de litige brevet." },
  { ...OSI, spdxId: "AFL-3.0",      name: "Academic Free License v3.0",                 gplCompatible: false, url: "https://spdx.org/licenses/AFL-3.0.html",         githubKey: null,       description: "Permissive avec mention d'auteur requise." },
  { ...OSI, spdxId: "CPAL-1.0",     name: "Common Public Attribution License 1.0",      gplCompatible: false, url: "https://spdx.org/licenses/CPAL-1.0.html",        githubKey: null,       description: "Copyleft réseau. Requiert la mention 'Powered by X'." },
  { ...OSI, spdxId: "LPPL-1.3c",    name: "LaTeX Project Public License v1.3c",         gplCompatible: false, url: "https://spdx.org/licenses/LPPL-1.3c.html",       githubKey: null,       description: "Copyleft pour LaTeX. Les fichiers modifiés doivent être renommés." },
  { ...OSI, spdxId: "MulanPSL-2.0", name: "Mulan Permissive Software License, Version 2", gplCompatible: true, url: "https://spdx.org/licenses/MulanPSL-2.0.html",  githubKey: "mulanpsl-2.0", description: "Licence permissive chinoise. Compatible Apache-2.0." },
  { ...OSI, spdxId: "PostgreSQL",   name: "PostgreSQL License",                          gplCompatible: true,  url: "https://spdx.org/licenses/PostgreSQL.html",      githubKey: "postgresql", description: "Permissive. Utilisée par PostgreSQL." },

  // ── Public domain ─────────────────────────────────────────────────────────────
  { ...OSI, spdxId: "CC0-1.0",    name: "Creative Commons Zero v1.0 Universal", gplCompatible: true, url: "https://spdx.org/licenses/CC0-1.0.html", githubKey: "cc0-1.0",  description: "Dédicace au domaine public. Aucune restriction d'utilisation." },
  { ...OSI, spdxId: "Unlicense",  name: "The Unlicense",                        gplCompatible: true, url: "https://spdx.org/licenses/Unlicense.html",githubKey: "unlicense", description: "Domaine public effectif avec clause de non-garantie." },

  // ── FSF-free non-OSI ──────────────────────────────────────────────────────────
  { ...FREE, spdxId: "WTFPL",      name: "Do What The F*ck You Want To Public License", gplCompatible: true, url: "https://spdx.org/licenses/WTFPL.html",     githubKey: null, description: "Domaine public informel. FSF-approuvé, non-OSI." },
  { ...FREE, spdxId: "CC-BY-4.0",  name: "Creative Commons Attribution 4.0",           gplCompatible: false,url: "https://spdx.org/licenses/CC-BY-4.0.html",  githubKey: null, description: "Partage avec attribution. FSF-libre, non-OSI (non recommandé pour le code)." },
  { ...FREE, spdxId: "CC-BY-SA-4.0", name: "Creative Commons Attribution-ShareAlike 4.0", gplCompatible: true, url: "https://spdx.org/licenses/CC-BY-SA-4.0.html", githubKey: null, description: "Partage avec attribution + copyleft. Compatible GPL-3 via dérogation." },
  { ...FREE, spdxId: "FTL",        name: "Freetype Project License",                   gplCompatible: true, url: "https://spdx.org/licenses/FTL.html",        githubKey: null, description: "Permissive avec mention d'auteur. Utilisée par FreeType." },
  { ...FREE, spdxId: "gnuplot",    name: "gnuplot License",                            gplCompatible: true, url: "https://spdx.org/licenses/gnuplot.html",    githubKey: null, description: "Permissive avec conditions de redistribution spécifiques." },
  { ...FREE, spdxId: "MS-PL",      name: "Microsoft Public License",                  gplCompatible: false,url: "https://spdx.org/licenses/MS-PL.html",       githubKey: "ms-pl", description: "Permissive Microsoft. Incompatible GPL selon la FSF." },
  { ...FREE, spdxId: "MS-RL",      name: "Microsoft Reciprocal License",              gplCompatible: false,url: "https://spdx.org/licenses/MS-RL.html",       githubKey: "ms-rl", description: "Copyleft par fichier Microsoft." },

  // ── Source-available ──────────────────────────────────────────────────────────
  { ...SOURCE, spdxId: "BUSL-1.1",     name: "Business Source License 1.1",    gplCompatible: false, url: "https://spdx.org/licenses/BUSL-1.1.html",    githubKey: null, description: "Source visible, usage commercial restreint pendant une période de conversion." },
  { ...SOURCE, spdxId: "SSPL-1.0",     name: "Server Side Public License v1",  gplCompatible: false, url: "https://spdx.org/licenses/SSPL-1.0.html",    githubKey: null, description: "Variante AGPL de MongoDB. Non approuvée OSI/FSF." },
  { ...SOURCE, spdxId: "Elastic-2.0",  name: "Elastic License 2.0",            gplCompatible: false, url: "https://spdx.org/licenses/Elastic-2.0.html", githubKey: null, description: "Source visible. Interdit la fourniture du logiciel comme service." },
  { ...SOURCE, spdxId: "Commons-Clause", name: "Commons Clause",               gplCompatible: false, url: "https://commonsclause.com",                  githubKey: null, description: "Restriction additive à une licence existante. Interdit la vente du logiciel." },
  { ...SOURCE, spdxId: "PolyForm-NC-1.0.0",  name: "PolyForm Noncommercial 1.0.0",  gplCompatible: false, url: "https://polyformproject.org/licenses/noncommercial/1.0.0/", githubKey: null, description: "Usage non-commercial uniquement." },
  { ...SOURCE, spdxId: "PolyForm-Small-1.0.0", name: "PolyForm Small Business 1.0.0", gplCompatible: false, url: "https://polyformproject.org/licenses/small-business/1.0.0/", githubKey: null, description: "Gratuit pour les petites entreprises, payant pour les autres." },
  { ...SOURCE, spdxId: "FSL-1.1-MIT",  name: "Functional Source License 1.1 (MIT)", gplCompatible: false, url: "https://fsl.software",               githubKey: null, description: "Source visible 2 ans, puis conversion automatique MIT." },
  { ...SOURCE, spdxId: "FSL-1.1-Apache-2.0", name: "Functional Source License 1.1 (Apache-2.0)", gplCompatible: false, url: "https://fsl.software", githubKey: null, description: "Source visible 2 ans, puis conversion automatique Apache-2.0." },

  // ── Proprietary ───────────────────────────────────────────────────────────────
  { ...PROP, spdxId: "LicenseRef-Proprietary",  name: "Proprietary",                gplCompatible: false, url: "",  githubKey: null, description: "Tous droits réservés. Aucune redistribution sans accord écrit." },
  { ...PROP, spdxId: "LicenseRef-AllRightsReserved", name: "All Rights Reserved",  gplCompatible: false, url: "",  githubKey: null, description: "Tous droits réservés. Usage privé uniquement." },
  { ...PROP, spdxId: "LicenseRef-Commercial",   name: "Commercial License",         gplCompatible: false, url: "",  githubKey: null, description: "Licence commerciale. Conditions définies par contrat." },
];

// ── Lookups ───────────────────────────────────────────────────────────────────

const BY_SPDX = new Map<string, LicenseEntry>(
  LICENSE_CATALOG.map((l) => [l.spdxId, l])
);

export function getLicense(spdxId: string): LicenseEntry | undefined {
  return BY_SPDX.get(spdxId);
}

export function isReputationEligible(spdxId: string): boolean {
  return BY_SPDX.get(spdxId)?.reputationEligible ?? false;
}

/** SPDX IDs that are reputation-eligible (osi + free categories). */
export const ELIGIBLE_SPDX_IDS: ReadonlySet<string> = new Set(
  LICENSE_CATALOG.filter((l) => l.reputationEligible).map((l) => l.spdxId)
);

/** GitHub API keys for licenses that can be auto-created via /licenses/{key}. */
export const GITHUB_CREATABLE_LICENSES: ReadonlyMap<string, string> = new Map(
  LICENSE_CATALOG
    .filter((l) => l.githubKey !== null)
    .map((l) => [l.spdxId, l.githubKey as string])
);

/**
 * Minimal LICENSE.md fallback text for licenses not available via GitHub API.
 * Used when auto-create is requested but the GitHub API doesn't carry the template.
 */
export function getFallbackLicenseText(spdxId: string, year: number, author: string): string {
  const entry = getLicense(spdxId);
  if (!entry) {
    return `# ${spdxId}\n\nSee ${spdxId} license terms.\n`;
  }
  if (entry.category === "proprietary") {
    return `# ${entry.name}\n\nCopyright (c) ${year} ${author}\n\nAll rights reserved. No part of this software may be reproduced, distributed, or transmitted in any form without prior written permission from the copyright holder.\n`;
  }
  if (entry.category === "source") {
    return `# ${entry.name}\n\nCopyright (c) ${year} ${author}\n\nLicensed under ${entry.name}. See full terms at:\n${entry.url}\n`;
  }
  // OSI / free without a GitHub key — point to the canonical text
  return `# ${entry.name}\n\nCopyright (c) ${year} ${author}\n\nThis project is licensed under ${entry.name} (${spdxId}).\nFull license text: ${entry.url}\n`;
}
