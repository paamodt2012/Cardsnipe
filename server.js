const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;

let accessToken = null;
let tokenExpiry = null;

const TRACKED_PLAYERS = {
  basketball: {
    'NBA Stars': [
      'Victor Wembanyama', 'Anthony Edwards', 'Shai Gilgeous-Alexander',
      'Luka Doncic', 'Jayson Tatum', 'Nikola Jokic', 'Giannis Antetokounmpo',
      'Stephen Curry', 'LeBron James', 'Ja Morant', 'Jalen Brunson',
      'Tyrese Haliburton', 'Tyrese Maxey', 'Cooper Flagg', 'VJ Edgecombe'
    ]
  },
  football: {
    'NFL Stars': [
      'Patrick Mahomes', 'Josh Allen', 'Jalen Hurts', 'CJ Stroud',
      'Jayden Daniels', 'Lamar Jackson', 'Joe Burrow', 'Justin Jefferson',
      'JaMarr Chase', 'CeeDee Lamb', 'Puka Nacua', 'Bijan Robinson',
      'Saquon Barkley', 'Amon-Ra St Brown', 'Micah Parsons'
    ]
  }
};

const PLAYER_ALIASES = {
  'Victor Wembanyama': ['wembanyama', 'wemby'],
  'Anthony Edwards': ['ant-man', 'ant edwards'],
  'Shai Gilgeous-Alexander': ['sga'],
  'Amon-Ra St Brown': ['st brown', 'amon ra'],
  'CJ Stroud': ['stroud'],
  'JaMarr Chase': ['jamarr'],
  'Ja Morant': ['morant']
};

const COLLEGE_KEYWORDS = ['college', 'collegiate', 'ncaa', 'draft picks', 'contenders draft', 'bowman u', 'university'];
const JUNK_KEYWORDS = ['lot of', 'case break', 'team break', 'repack', 'mystery box', 'custom card', 'reprint', 'facsimile'];
const GRADED_KEYWORDS = ['psa', 'bgs', 'beckett', 'sgc', 'cgc', 'graded', 'slab'];

const PARALLEL_NORMALIZATION = {
  'silver prizm': 'SILVER',
  'prizm silver': 'SILVER',
  'red wave': 'RED_WAVE',
  'wave red': 'RED_WAVE',
  'blue wave': 'BLUE_WAVE',
  'wave blue': 'BLUE_WAVE',
  'green wave': 'GREEN_WAVE',
  'purple wave': 'PURPLE_WAVE',
  'tiger stripe': 'TIGER',
  'orange tiger': 'TIGER',
  'gold shimmer': 'GOLD_SHIMMER',
  'pink ice': 'PINK_ICE',
  'orange ice': 'ORANGE_ICE',
  'cracked ice': 'CRACKED_ICE',
  'red ice': 'RED_ICE',
  'green ice': 'GREEN_ICE',
  'blue ice': 'BLUE_ICE',
  'ruby wave': 'RUBY_WAVE',
  'tiger': 'TIGER',
  'zebra': 'ZEBRA',
  'silver': 'SILVER',
  'disco': 'DISCO',
  'scope': 'SCOPE',
  'holo': 'HOLO',
  'mojo': 'MOJO'
};

const PARALLEL_KEYS = Object.keys(PARALLEL_NORMALIZATION).sort((a, b) => b.length - a.length);

const SET_KEYWORDS = {
  'PRIZM': ['prizm'],
  'SELECT': ['select'],
  'OPTIC': ['optic'],
  'NATIONAL_TREASURES': ['national treasures', 'national treasure']
};

async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const credentials = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');
  
  const response = await axios.post(
    'https://api.ebay.com/identity/v1/oauth2/token',
    'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      }
    }
  );

  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;
  
  return accessToken;
}

function normalizePlayerName(name) {
  return name.toLowerCase().replace(/[''.\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getPlayerTokens(playerName) {
  const normalized = normalizePlayerName(playerName);
  const parts = normalized.split(' ').filter(p => p.length > 1);
  
  const tokens = new Set([normalized]);
  
  if (parts.length >= 2) {
    tokens.add(parts[parts.length - 1]);
  }
  
  if (PLAYER_ALIASES[playerName]) {
    PLAYER_ALIASES[playerName].forEach(alias => {
      tokens.add(normalizePlayerName(alias));
    });
  }
  
  return Array.from(tokens);
}

function detectPlayer(title, candidatePlayers) {
  const titleNorm = normalizePlayerName(title);
  
  for (const player of candidatePlayers) {
    const tokens = getPlayerTokens(player);
    
    for (const token of tokens) {
      if (token.length < 3) continue;
      
      const parts = token.split(' ');
      if (parts.length >= 2) {
        if (parts.every(p => titleNorm.includes(p))) {
          return player;
        }
      } else {
        const regex = new RegExp(`\\b${token}\\b`);
        if (regex.test(titleNorm)) {
          return player;
        }
      }
    }
  }
  
  return null;
}

function detectYear(title) {
  const match = title.match(/\b(20\d{2})\b/);
  return match ? match[1] : null;
}

function detectSetName(title) {
  const titleLower = title.toLowerCase();
  
  if (titleLower.includes('draft')) {
    return null;
  }
  
  for (const [setName, keywords] of Object.entries(SET_KEYWORDS)) {
    for (const kw of keywords) {
      if (titleLower.includes(kw)) {
        return setName;
      }
    }
  }
  
  return null;
}

function detectCollege(title) {
  const titleLower = title.toLowerCase();
  return COLLEGE_KEYWORDS.some(kw => titleLower.includes(kw));
}

function detectJunk(title) {
  const titleLower = title.toLowerCase();
  return JUNK_KEYWORDS.some(kw => titleLower.includes(kw));
}

function detectGraded(title) {
  const titleLower = title.toLowerCase();
  
  for (const kw of GRADED_KEYWORDS) {
    if (titleLower.includes(kw)) {
      let grader = null;
      if (titleLower.includes('psa')) grader = 'PSA';
      else if (titleLower.includes('bgs') || titleLower.includes('beckett')) grader = 'BGS';
      else if (titleLower.includes('sgc')) grader = 'SGC';
      else if (titleLower.includes('cgc')) grader = 'CGC';
      
      const gradeMatch = title.match(/\b(10|9\.5|9|8\.5|8|7\.5|7)\b/);
      const grade = gradeMatch ? gradeMatch[1] : null;
      
      return { isGraded: true, grader, grade };
    }
  }
  
  return { isGraded: false, grader: null, grade: null };
}

function detectCardNumber(title) {
  const match = title.match(/#(\d+)|no\.?\s*(\d+)/i);
  return match ? (match[1] || match[2]) : null;
}

function detectSerial(title) {
  const match = title.match(/\/(\d+)|out of (\d+)|##\/(\d+)/i);
  return match ? (match[1] || match[2] || match[3]) : null;
}

function detectParallel(title) {
  const titleLower = title.toLowerCase();
  
  for (const key of PARALLEL_KEYS) {
    if (titleLower.includes(key)) {
      return PARALLEL_NORMALIZATION[key];
    }
  }
  
  return null;
}

function detectRookie(title) {
  return /\b(rookie|rc)\b/i.test(title);
}

function detectAuto(title) {
  return /\b(auto|autograph|signed)\b/i.test(title);
}

function detectPatch(title) {
  return /\b(patch|jersey|relic|memorabilia)\b/i.test(title);
}

function normalizeTitle(title) {
  const noise = ['panini', 'the', 'card', 'new', 'rare', 'hot', 'invest', 'rc', 'rookie', 'nba', 'nfl'];
  let normalized = title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  
  noise.forEach(word => {
    normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'g'), '');
  });
  
  return normalized.replace(/\s+/g, ' ').trim();
}

function buildFingerprintFromTitle(title, candidatePlayers) {
  const player = detectPlayer(title, candidatePlayers);
  const year = detectYear(title);
  const setName = detectSetName(title);
  const isCollege = detectCollege(title);
  const isJunk = detectJunk(title);
  const { isGraded, grader, grade } = detectGraded(title);
  const cardNumber = detectCardNumber(title);
  const serialDenom = detectSerial(title);
  const parallelNormalized = detectParallel(title);
  const rookieFlag = detectRookie(title);
  const autoFlag = detectAuto(title);
  const patchFlag = detectPatch(title);
  const normalizedTitle = normalizeTitle(title);
  
  return {
    playerNormalized: player,
    year,
    setName,
    isCollege,
    isJunk,
    isGraded,
    grader,
    grade,
    cardNumber,
    serialDenom,
    parallelNormalized,
    rookieFlag,
    autoFlag,
    patchFlag,
    normalizedTitle,
    rawTitle: title
  };
}

function passesHardGates(liveFp, compFp) {
  if (liveFp.playerNormalized !== compFp.playerNormalized) {
    return { pass: false, reason: 'player mismatch' };
  }
  
  if (liveFp.year !== compFp.year) {
    return { pass: false, reason: 'year mismatch' };
  }
  
  if (liveFp.setName !== compFp.setName) {
    return { pass: false, reason: 'set mismatch' };
  }
  
  if (liveFp.isGraded !== compFp.isGraded) {
    return { pass: false, reason: 'graded mismatch' };
  }
  
  if (liveFp.isGraded) {
    if (liveFp.grader !== compFp.grader) {
      return { pass: false, reason: 'grader mismatch' };
    }
    if (liveFp.grade !== compFp.grade) {
      return { pass: false, reason: 'grade mismatch' };
    }
  }
  
  if (compFp.isCollege) {
    return { pass: false, reason: 'college card' };
  }
  
  if (compFp.isJunk) {
    return { pass: false, reason: 'junk listing' };
  }
  
  return { pass: true };
}

function calculateTitleSimilarity(title1, title2) {
  const words1 = new Set(title1.split(' '));
  const words2 = new Set(title2.split(' '));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

function scoreComp(liveFp, compFp) {
  let score = 0;
  const breakdown = [];
  
  if (liveFp.cardNumber && compFp.cardNumber) {
    if (liveFp.cardNumber === compFp.cardNumber) {
      score += 25;
      breakdown.push('cardNum+25');
    }
  }
  
  if (liveFp.serialDenom && compFp.serialDenom) {
    if (liveFp.serialDenom === compFp.serialDenom) {
      score += 25;
      breakdown.push('serial+25');
    }
  }
  
  if (liveFp.parallelNormalized && compFp.parallelNormalized) {
    if (liveFp.parallelNormalized === compFp.parallelNormalized) {
      score += 20;
      breakdown.push('parallel+20');
    }
  }
  
  if (liveFp.rookieFlag && compFp.rookieFlag) {
    score += 10;
    breakdown.push('rookie+10');
  }
  
  if (liveFp.autoFlag && compFp.autoFlag) {
    score += 10;
    breakdown.push('auto+10');
  }
  
  if (liveFp.patchFlag && compFp.patchFlag) {
    score += 10;
    breakdown.push('patch+10');
  }
  
  const titleSim = calculateTitleSimilarity(liveFp.normalizedTitle, compFp.normalizedTitle);
  const titleScore = Math.round(titleSim * 20);
  score += titleScore;
  breakdown.push(`title+${titleScore}`);
  
  const liveIsSSP = liveFp.serialDenom && parseInt(liveFp.serialDenom) <= 25;
  const compIsSSP = compFp.serialDenom && parseInt(compFp.serialDenom) <= 25;
  if (liveIsSSP !== compIsSSP) {
    score -= 40;
    breakdown.push('SSP_mismatch-40');
  }
  
  return { score, breakdown };
}

function dedupeComps(comps) {
  const seen = new Map();
  const deduped = [];
  
  for (const comp of comps) {
    const normalized = comp.fingerprint.normalizedTitle;
    
    let isDupe = false;
    for (const [existingTitle] of seen.entries()) {
      const similarity = calculateTitleSimilarity(normalized, existingTitle);
      if (similarity > 0.92) {
        isDupe = true;
        break;
      }
    }
    
    if (!isDupe) {
      seen.set(normalized, comp);
      deduped.push(comp);
    }
  }
  
  return deduped;
}

function computeReferencePrice(comps) {
  if (comps.length < 3) {
    return { price: null, confidence: 'insufficient', reason: `only ${comps.length} comps` };
  }
  
  const prices = comps.map(c => c.price).sort((a, b) => a - b);
  const lowestK = prices.slice(0, Math.min(10, prices.length));
  
  let trimmed = lowestK;
  if (lowestK.length >= 8) {
    const trimCount = Math.floor(lowestK.length * 0.1);
    trimmed = lowestK.slice(trimCount, lowestK.length - trimCount);
  }
  
  const median = trimmed.length % 2 === 0
    ? (trimmed[Math.floor(trimmed.length / 2) - 1] + trimmed[Math.floor(trimmed.length / 2)]) / 2
    : trimmed[Math.floor(trimmed.length / 2)];
  
  const mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  const variance = trimmed.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / trimmed.length;
  const stddev = Math.sqrt(variance);
  const cv = stddev / mean;
  
  const confidence = cv < 0.18 ? 'high' : 'moderate';
  
  return { price: median, confidence, cv: cv.toFixed(3), compsUsed: comps.length };
}

async function searchListings(playerName) {
  const token = await getAccessToken();
  const keywords = `${playerName} prizm`;
  
  const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
  const params = {
    q: keywords,
    category_ids: '261328',
    filter: 'price:[40..150],priceCurrency:USD,buyingOptions:{FIXED_PRICE}',
    limit: 50
  };
  
  console.log(`\n🔍 Searching: "${keywords}"`);
  
  const response = await axios.get(url, {
    params,
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
    }
  });
  
  if (!response.data || !response.data.itemSummaries) {
    console.log('  ⚠ No results');
    return [];
  }
  
  const allPlayers = [
    ...TRACKED_PLAYERS.basketball['NBA Stars'],
    ...TRACKED_PLAYERS.football['NFL Stars']
  ];
  
  const items = response.data.itemSummaries;
  const validCards = [];
  
  const filters = {
    total: items.length,
    wrongPlayer: 0,
    college: 0,
    junk: 0,
    noSet: 0,
    graded: 0,
    passed: 0
  };
  
  for (const item of items) {
    // Skip items without valid price
    if (!item.price || !item.price.value) {
      continue;
    }
    
    const fp = buildFingerprintFromTitle(item.title, allPlayers);
    
    if (fp.playerNormalized !== playerName) {
      filters.wrongPlayer++;
      continue;
    }
    
    if (fp.isCollege) {
      filters.college++;
      continue;
    }
    
    if (fp.isJunk) {
      filters.junk++;
      continue;
    }
    
    if (!fp.setName) {
      filters.noSet++;
      continue;
    }
    
    if (fp.isGraded) {
      filters.graded++;
      continue;
    }
    
    filters.passed++;
    
    validCards.push({
      itemId: item.itemId,
      title: item.title,
      price: parseFloat(item.price.value),
      url: item.itemWebUrl,
      fingerprint: fp
    });
  }
  
  console.log(`  Filters: ${JSON.stringify(filters)}`);
  console.log(`  ✅ Valid cards: ${validCards.length}`);
  
  return validCards;
}

async function searchCompCandidates(liveFp, phase = 'strict') {
  const token = await getAccessToken();
  
  let keywords = liveFp.playerNormalized;
  
  if (liveFp.setName === 'PRIZM') keywords += ' prizm';
  else if (liveFp.setName === 'SELECT') keywords += ' select';
  else if (liveFp.setName === 'OPTIC') keywords += ' optic';
  else if (liveFp.setName === 'NATIONAL_TREASURES') keywords += ' national treasures';
  
  if (liveFp.year) keywords += ` ${liveFp.year}`;
  
  if (phase === 'strict') {
    // Include card number in strict search
    if (liveFp.cardNumber) keywords += ` #${liveFp.cardNumber}`;
    
    // Only include COMMON parallels (silver, base colors) - skip rare ones
    const commonParallels = ['SILVER', 'RED_WAVE', 'BLUE_WAVE', 'GREEN_WAVE', 'PURPLE_WAVE'];
    if (liveFp.parallelNormalized && commonParallels.includes(liveFp.parallelNormalized)) {
      keywords += ` ${liveFp.parallelNormalized.toLowerCase().replace(/_/g, ' ')}`;
    }
    
    // Include serial only if it's common (/99, /25, etc)
    if (liveFp.serialDenom && parseInt(liveFp.serialDenom) >= 25) {
      keywords += ` /${liveFp.serialDenom}`;
    }
  }
  
  keywords += ' -college -ncaa -draft -lot -break -repack -psa -bgs -sgc -cgc -graded';
  
  const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
  const params = {
    q: keywords,
    category_ids: '261328',
    filter: phase === 'strict' 
      ? 'price:[30..180],priceCurrency:USD,buyingOptions:{FIXED_PRICE}'
      : 'price:[20..200],priceCurrency:USD,buyingOptions:{FIXED_PRICE|AUCTION}',
    limit: 100
  };
  
  console.log(`  🔎 Comp search (${phase}): "${keywords}"`);
  
  const response = await axios.get(url, {
    params,
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
    }
  });
  
  if (!response.data || !response.data.itemSummaries) {
    return [];
  }
  
  const allPlayers = [
    ...TRACKED_PLAYERS.basketball['NBA Stars'],
    ...TRACKED_PLAYERS.football['NFL Stars']
  ];
  
  const candidates = [];
  for (const item of response.data.itemSummaries) {
    // Skip items without valid price
    if (!item.price || !item.price.value) {
      continue;
    }
    
    const fp = buildFingerprintFromTitle(item.title, allPlayers);
    
    candidates.push({
      itemId: item.itemId,
      title: item.title,
      price: parseFloat(item.price.value),
      fingerprint: fp
    });
  }
  
  console.log(`  📦 Fetched ${candidates.length} candidates`);
  return candidates;
}

async function findCompsForListing(listing) {
  const liveFp = listing.fingerprint;
  
  console.log(`\n📋 Card: ${liveFp.year || '????'} ${liveFp.setName} ${liveFp.playerNormalized}`);
  if (liveFp.cardNumber) console.log(`   #${liveFp.cardNumber}`);
  if (liveFp.serialDenom) console.log(`   /${liveFp.serialDenom}`);
  if (liveFp.parallelNormalized) console.log(`   ${liveFp.parallelNormalized}`);
  
  let candidates = await searchCompCandidates(liveFp, 'strict');
  
  let acceptedComps = [];
  const rejections = {};
  
  for (const cand of candidates) {
    if (cand.itemId === listing.itemId) continue;
    
    const gateResult = passesHardGates(liveFp, cand.fingerprint);
    if (!gateResult.pass) {
      rejections[gateResult.reason] = (rejections[gateResult.reason] || 0) + 1;
      continue;
    }
    
    const { score, breakdown } = scoreComp(liveFp, cand.fingerprint);
    
    if (score >= 60) {
      acceptedComps.push({
        ...cand,
        compScore: score,
        scoreBreakdown: breakdown
      });
      console.log(`  ✅ ${cand.price} [${score}] ${breakdown.join(', ')}`);
    } else {
      rejections['score<60'] = (rejections['score<60'] || 0) + 1;
    }
  }
  
  if (acceptedComps.length < 3) {
    console.log(`  ⚠ Only ${acceptedComps.length} comps, expanding...`);
    
    const expansionCandidates = await searchCompCandidates(liveFp, 'expansion');
    
    for (const cand of expansionCandidates) {
      if (cand.itemId === listing.itemId) continue;
      if (acceptedComps.some(c => c.itemId === cand.itemId)) continue;
      
      const gateResult = passesHardGates(liveFp, cand.fingerprint);
      if (!gateResult.pass) continue;
      
      const { score, breakdown } = scoreComp(liveFp, cand.fingerprint);
      
      if (score >= 60) {
        acceptedComps.push({
          ...cand,
          compScore: score,
          scoreBreakdown: breakdown
        });
        console.log(`  ✅ ${cand.price} [${score}] ${breakdown.join(', ')}`);
      }
    }
  }
  
  console.log(`  Rejections: ${JSON.stringify(rejections)}`);
  
  const deduped = dedupeComps(acceptedComps);
  console.log(`  After dedupe: ${deduped.length} comps`);
  
  deduped.sort((a, b) => b.compScore - a.compScore);
  
  return deduped.slice(0, 8);
}

function evaluateDeal(listing, comps) {
  const { price: refPrice, confidence, cv, compsUsed } = computeReferencePrice(comps);
  
  if (!refPrice) {
    console.log(`  ❌ Insufficient data: ${compsUsed || 0} comps`);
    return null;
  }
  
  const ratio = listing.price / refPrice;
  console.log(`  💰 Ref: ${refPrice.toFixed(2)} | Listing: ${listing.price} | Ratio: ${(ratio * 100).toFixed(1)}% | CV: ${cv}`);
  
  if (ratio <= 0.90 && (confidence === 'high' || confidence === 'moderate')) {
    const discount = ((1 - ratio) * 100).toFixed(1);
    console.log(`  🎯 DEAL! ${discount}% off`);
    
    return {
      itemId: listing.itemId,
      title: listing.title,
      price: listing.price,
      url: listing.url,
      player: listing.fingerprint.playerNormalized,
      referencePrice: refPrice.toFixed(2),
      percentUnder: discount,
      confidence,
      compsUsed,
      topComps: comps.slice(0, 3).map(c => ({ title: c.title, price: c.price })),
      timestamp: new Date().toISOString()
    };
  }
  
  return null;
}

app.post('/api/scan', async (req, res) => {
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
    return res.status(400).json({ success: false, error: 'eBay API not configured' });
  }

  const selectedPlayers = req.body.players || [];
  
  if (selectedPlayers.length === 0) {
    return res.status(400).json({ success: false, error: 'No players selected' });
  }

  console.log('\n========== CARDSNIPE SCAN ==========');
  console.log('Engine: Fingerprint + Scoring + 2-Phase');
  console.log('Threshold: ≤90% of trimmed floor median (10% off)\n');
  
  const deals = [];
  const errors = [];

  try {
    for (const player of selectedPlayers) {
      try {
        const listings = await searchListings(player);
        
        for (const listing of listings) {
          const comps = await findCompsForListing(listing);
          const deal = evaluateDeal(listing, comps);
          
          if (deal) deals.push(deal);
          
          await new Promise(resolve => setTimeout(resolve, 1200));
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`ERROR: ${player} - ${error.message}`);
        errors.push({ player, error: error.message });
      }
    }

    console.log('\n========== COMPLETE ==========');
    console.log(`DEALS: ${deals.length}\n`);

    res.json({ 
      success: true, 
      deals: deals,
      scanned: selectedPlayers.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error(`FATAL: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    configured: !!(EBAY_CLIENT_ID && EBAY_CLIENT_SECRET),
    timestamp: new Date().toISOString() 
  });
});

app.get('/api/players', (req, res) => {
  res.json(TRACKED_PLAYERS);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CardSnipe running on port ${PORT}`);
  console.log(`eBay API: ${!!(EBAY_CLIENT_ID && EBAY_CLIENT_SECRET) ? 'configured' : 'NOT configured'}`);
});
