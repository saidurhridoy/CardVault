/* ============================================================================
   Team vault analytics — pure functions (no DOM), Node-testable.
   Given a team's cards (each with user_id = who added it) and its member
   list, computes the "who knows whom" intelligence that makes a shared
   vault worth paying for:
     • duplicate/known-by detection across members
     • stale contacts
     • top companies in the vault
     • which members share which relationships (who-knows-whom)
   ========================================================================== */

const digitKey = (s) => {
  const d = String(s || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('880') && d.length >= 12) return '0' + d.slice(3);
  return d;
};

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:]+$/g, '').trim();

/** All phone keys + email keys + name/company key for a card. */
function cardKeys(c) {
  const keys = [];
  String(c.phone || '').split(/[,;]/).forEach((p) => {
    const k = digitKey(p);
    if (k.length >= 8) keys.push({ type: 'phone', key: 'p:' + k });
  });
  String(c.email || '').split(/[,;]/).forEach((e) => {
    const t = norm(e);
    if (t.includes('@')) keys.push({ type: 'email', key: 'e:' + t });
  });
  if (norm(c.name) && norm(c.company)) {
    keys.push({ type: 'name+company', key: 'n:' + norm(c.name) + '|' + norm(c.company) });
  }
  return keys;
}

const STALE_AFTER_DAYS = 180;

/**
 * @param {Array} cards   team cards; each needs: id, user_id, name, company,
 *                        designation, phone, email, created_at
 * @param {Array} members [{user_id, name, email, role}]
 * @returns team analytics summary
 */
export function computeTeamAnalytics(cards, members) {
  const list = Array.isArray(cards) ? cards : [];
  const memberById = new Map((members || []).map((m) => [m.user_id, m]));

  // ---- duplicates / "known by" groups (same person added by 1+ members)
  const byKey = new Map(); // key -> Set of card indexes
  list.forEach((c, i) => {
    cardKeys(c).forEach(({ key }) => {
      if (!byKey.has(key)) byKey.set(key, new Set());
      byKey.get(key).add(i);
    });
  });

  const grouped = new Map(); // sorted index-set id -> { indexes:Set, matches:Set }
  byKey.forEach((idxSet, key) => {
    if (idxSet.size < 2) return;
    const id = [...idxSet].sort((a, b) => a - b).join(',');
    if (!grouped.has(id)) grouped.set(id, { indexes: new Set(), matches: new Set() });
    const g = grouped.get(id);
    idxSet.forEach((i) => g.indexes.add(i));
    g.matches.add(key.split(':')[0] === 'p' ? 'phone' : key[0] === 'e' ? 'email' : 'name+company');
  });

  const nameOf = (u) => {
    const m = memberById.get(u);
    return m ? (m.name || m.email || 'Member') : 'Former member';
  };

  const duplicates = [...grouped.values()].map((g) => {
    const cardsIn = [...g.indexes].map((i) => list[i]);
    const owners = [...new Set(cardsIn.map((c) => c.user_id))];
    return {
      label: cardsIn[0].name || cardsIn[0].company || 'Untitled',
      company: cardsIn[0].company || '',
      matches: [...g.matches],
      knownBy: owners.map(nameOf),          // 1 owner → own duplicate; 2+ → shared relationship
      shared: owners.length > 1,
      cards: cardsIn.map((c) => ({ id: c.id, name: c.name, company: c.company }))
    };
  }).sort((a, b) => Number(b.shared) - Number(a.shared) || b.knownBy.length - a.knownBy.length);

  // ---- stale contacts
  const now = Date.now();
  const stale = list
    .filter((c) => {
      const t = Date.parse(c.created_at);
      return !Number.isNaN(t) && (now - t) > STALE_AFTER_DAYS * 86400000;
    })
    .map((c) => ({
      id: c.id,
      name: c.name || c.company || 'Untitled',
      company: c.company || '',
      addedBy: nameOf(c.user_id),
      created_at: c.created_at
    }))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  // ---- top companies
  const companyCount = new Map();
  list.forEach((c) => {
    const k = norm(c.company);
    if (!k) return;
    companyCount.set(k, (companyCount.get(k) || 0) + 1);
  });
  const topCompanies = [...companyCount.entries()]
    .map(([company, count]) => ({
      company: list.find((c) => norm(c.company) === company).company,
      count
    }))
    .sort((a, b) => b.count - a.count || a.company.localeCompare(b.company))
    .slice(0, 8);

  // ---- who knows whom: members who both added a card from the same company
  const companyOwners = new Map(); // companyKey -> Set(user_id)
  list.forEach((c) => {
    const k = norm(c.company);
    if (!k) return;
    if (!companyOwners.has(k)) companyOwners.set(k, new Set());
    companyOwners.get(k).add(c.user_id);
  });
  const pairCompanies = new Map(); // "idA|idB" -> Set(companyKey)
  companyOwners.forEach((owners, companyKey) => {
    const arr = [...owners];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const pk = [arr[i], arr[j]].sort().join('|');
        if (!pairCompanies.has(pk)) pairCompanies.set(pk, new Set());
        pairCompanies.get(pk).add(companyKey);
      }
    }
  });
  const whoKnowsWhom = [...pairCompanies.entries()].map(([pk, companies]) => {
    const [a, b] = pk.split('|');
    return {
      a: nameOf(a), b: nameOf(b),
      aId: a, bId: b,
      sharedCompanies: [...companies].slice(0, 6),
      sharedCount: companies.size
    };
  }).filter((p) => memberById.has(p.aId) && memberById.has(p.bId))
    .sort((x, y) => y.sharedCount - x.sharedCount);

  // ---- per-member activity
  const activity = (members || []).map((m) => ({
    name: m.name || m.email || 'Member',
    email: m.email || '',
    role: m.role || 'member',
    cards: list.filter((c) => c.user_id === m.user_id).length
  })).sort((a, b) => b.cards - a.cards);

  return {
    totalCards: list.length,
    duplicateGroups: duplicates.length,
    crossMemberContacts: duplicates.filter((d) => d.shared).length,
    duplicates,
    stale,
    topCompanies,
    whoKnowsWhom,
    activity
  };
}
