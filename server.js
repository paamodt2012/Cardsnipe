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
      'Victor Wembanyama',
      'Anthony Edwards',
      'Shai Gilgeous-Alexander',
      'Luka Doncic',
      'Jayson Tatum',
      'Nikola Jokic',
      'Giannis Antetokounmpo',
      'Stephen Curry',
      'LeBron James',
      'Ja Morant',
      'Jalen Brunson',
      'Tyrese Haliburton',
      'Tyrese Maxey',
      'Cooper Flagg',
      'VJ Edgecombe'
    ]
  },
  football: {
    'NFL Stars': [
      'Patrick Mahomes',
      'Josh Allen',
      'Jalen Hurts',
      'CJ Stroud',
      'Jayden Daniels',
      'Lamar Jackson',
      'Joe Burrow',
      'Justin Jefferson',
      'JaMarr Chase',
      'CeeDee Lamb',
      'Puka Nacua',
      'Bijan Robinson',
      'Saquon Barkley',
      'Amon-Ra St Brown',
      'Micah Parsons'
    ]
  }
};

const PLAYER_ALIASES = {
  'Victor Wembanyama': ['wembanyama', 'wemby'],
  'Anthony Edwards': ['edwards', 'ant-man'],
  'Shai Gilgeous-Alexander': ['gilgeous-alexander', 'sga'],
  'Amon-Ra St Brown': ['st brown', 'sun god'],
  'CJ Stroud': ['stroud'],
  'JaMarr Chase': ['chase', 'jamarr'],
  'Ja Morant': ['morant']
};

const COLLEGE_KEYWORDS = ['college', 'collegiate', 'ncaa', 'draft picks', 'draft pick', 'university', 'contenders draft', 'bowman u'];
const JUNK_KEYWORDS = ['lot', 'lot of', 'break', 'case break', 'repack', 'mystery', 'digital', 'custom', 'reprint'];
const GRADED_KEYWORDS = ['psa', 'bgs', 'sgc', 'cgc', 'graded', 'slab', 'gem mint'];

// Sort by length DESC so "silver prizm" matches before "silver"
const PARALLEL_MAP = {
  'silver prizm': 'SILVER',
  'prizm silver': 'SILVER',
  'blue wave': 'BLUE_WAVE',
  'red wave': 'RED_WAVE',
  'green wave': 'GREEN_WAVE',
  'purple wave': 'PURPLE_WAVE',
  'tiger stripe': 'TIGER',
  'gold shimmer': 'GOLD_SHIMMER',
  'pink ice': 'PINK_ICE',
  'orange ice': 'ORANGE_ICE',
  'cracked ice': 'CRACKED_ICE',
  'silver': 'SILVER',
  'tiger': 'TIGER',
  'zebra': 'ZEBRA',
  'disco': 'DISCO',
  'scope': 'SCOPE',
  'holo': 'HOLO',
  'mojo': 'MOJO'
};

const PARALLEL_KEYS = Object.keys(PARALLEL_MAP).sort((a, b) => b.length - a.length);

const STRONG_PARALLELS = ['TIGER', 'ZEBRA', 'GOLD_SHIMMER', 'PINK_ICE', 'ORANGE_ICE', 'CRACKED_ICE'];

// Comp cache to avoid duplicate API calls
const compCache = new Map();

async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  try {
    const credentials = Buffer.from(EBAY_CLIENT_ID + ':' + EBAY_CLIENT_SECRET).toString('base64');
    
    const response = await axios.post(
      'https://api.ebay.com/identity/v1/oauth2/token',
      'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + credentials
        }
      }
    );

    accessToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;
    
    console.log('✓ OAuth token obtained');
    return accessToken;
  } catch (error) {
    console.error('✗ Token error:', error.message);
    throw error;
  }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPlayerVariants(playerName) {
  const variants = [];
  const normalized = playerName.toLowerCase().replace(/['']/g, "'");
  
  // Add full name
  variants.push(normalized);
  
  // Add last name
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    variants.push(parts[parts.length - 1]);
  }
  
  // Add aliases
  if (PLAYER_ALIASES[playerName]) {
    PLAYER_ALIASES[playerName].forEach(alias => {
      variants.push(alias.toLowerCase().replace(/['']/g, "'"));
    });
  }
  
  return variants;
}

function playerInTitle(playerName, title) {
  const t = title.toLowerCase().replace(/['']/g, "'").replace(/[.\-]/g, ' ');
  const variants = getPlayerVariants(playerName);
  
  // Require word boundary match for variants 3+ chars
  for (const v of variants) {
    if (v.length < 3) continue;
    const re = new RegExp(`\\b${escapeRegExp(v)}\\b`, 'i');
    if (re.test(t)) return true;
  }
  
  return false;
}

function isCollegeTitle(title) {
  const lower = title.toLowerCase();
  return COLLEGE_KEYWORDS.some(kw => lower.includes(kw));
}

function isJunkTitle(title) {
  const lower = title.toLowerCase();
  return JUNK_KEYWORDS.some(kw => lower.includes(kw));
}

function normalizeParallel(title) {
  const titleLower = title.toLowerCase();
  
  // Check longest keys first to avoid "silver" matching before "silver prizm"
  for (const key of PARALLEL_KEYS) {
    if (titleLower.includes(key)) {
      return PARALLEL_MAP[key];
    }
  }
  
  return null;
}

function parseCardTitle(title) {
  const titleLower = title.toLowerCase();
  
  const isCollege = isCollegeTitle(title);
  const isJunk = isJunkTitle(title);
  
  let setName = null;
  if (titleLower.includes('national treasures') || titleLower.includes('national treasure')) {
    setName = 'NATIONAL_TREASURES';
  } else if (titleLower.includes('prizm')) {
    if (titleLower.includes('draft')) {
      return { isCollege: true };
    }
    setName = 'PRIZM';
  } else if (titleLower.includes('select')) {
    if (titleLower.includes('draft')) {
      return { isCollege: true };
    }
    setName = 'SELECT';
  } else if (titleLower.includes('optic')) {
    setName = 'OPTIC';
  }
  
  const yearMatch = title.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : null;
  
  const cardNumberMatch = title.match(/#(\d+)|no\.?\s*(\d+)/i);
  const cardNumber = cardNumberMatch ? (cardNumberMatch[1] || cardNumberMatch[2]) : null;
  
  const serialMatch = title.match(/\/(\d+)|out of (\d+)|##\/(\d+)/i);
  const serial = serialMatch ? (serialMatch[1] || serialMatch[2] || serialMatch[3]) : null;
  
  const isRookie = /\b(rookie|rc)\b/i.test(title);
  
  const parallel = normalizeParallel(title);
  
  let isGraded = false;
  let grader = null;
  let grade = null;
  
  for (const kw of GRADED_KEYWORDS) {
    if (titleLower.includes(kw)) {
      isGraded = true;
      break;
    }
  }
  
  if (isGraded) {
    if (titleLower.includes('psa')) grader = 'PSA';
    else if (titleLower.includes('bgs')) grader = 'BGS';
    else if (titleLower.includes('sgc')) grader = 'SGC';
    else if (titleLower.includes('cgc')) grader = 'CGC';
    
    const gradeMatch = title.match(/\b(10|9\.5|9|8\.5|8)\b/);
    grade = gradeMatch ? gradeMatch[1] : null;
  }
  
  return {
    isCollege,
    isJunk,
    setName,
    year,
    cardNumber,
    serial,
    parallel,
    isRookie,
    isGraded,
    grader,
    grade,
    title
  };
}

function matchFingerprints(live, comp, livePlayerName) {
  // Must have player name
  if (!playerInTitle(livePlayerName, comp.title)) {
    return { match: false, reason: 'player name not found' };
  }
  
  // No college cards
  if (live.isCollege || comp.isCollege) {
    return { match: false, reason: 'college card' };
  }
  
  // Must match set
  if (live.setName !== comp.setName) {
    return { match: false, reason: 'set mismatch' };
  }
  
  // Must match year
  if (live.year && comp.year && live.year !== comp.year) {
    return { match: false, reason: 'year mismatch' };
  }
  
  // Must match graded status
  if (live.isGraded !== comp.isGraded) {
    return { match: false, reason: 'graded mismatch' };
  }
  
  // STRICT: If EITHER has serial, they must match
  if (live.serial || comp.serial) {
    if (live.serial !== comp.serial) {
      return { match: false, reason: 'serial mismatch' };
    }
  }
  
  // STRICT: Parallels must match (not just "strong" ones)
  if (live.parallel || comp.parallel) {
    if (live.parallel !== comp.parallel) {
      return { match: false, reason: 'parallel mismatch' };
    }
  }
  
  // Card number should match if both present
  if (live.cardNumber && comp.cardNumber && live.cardNumber !== comp.cardNumber) {
    return { match: false, reason: 'card# mismatch' };
  }
  
  return { match: true };
}

function scoreMatch(live, comp) {
  let score = 0;
  
  if (live.cardNumber && comp.cardNumber && live.cardNumber === comp.cardNumber) {
    score += 5;
  }
  
  if (live.serial && comp.serial && live.serial === comp.serial) {
    score += 5;
  }
  
  if (live.parallel && comp.parallel && live.parallel === comp.parallel) {
    score += 4;
  }
  
  if (live.year && comp.year && live.year === comp.year) {
    score += 3;
  }
  
  if (live.isRookie && comp.isRookie) {
    score += 2;
  }
  
  return score;
}

function calculateFloorMedian(prices) {
  if (prices.length === 0) return 0;
  
  const sorted = prices.slice().sort((a, b) => a - b);
  const lowest = sorted.slice(0, Math.min(10, sorted.length));
  
  const mid = Math.floor(lowest.length / 2);
  if (lowest.length % 2 === 0) {
    return (lowest[mid - 1] + lowest[mid]) / 2;
  }
  return lowest[mid];
}

function pickComps(listing, candidates) {
  const liveFp = listing.fingerprint;
  const scoredComps = [];
  
  let rejectionCount = 0;
  const rejectionReasons = {};
  
  for (const candidate of candidates) {
    const compFp = parseCardTitle(candidate.title);
    
    if (compFp.isCollege || compFp.isJunk) {
      rejectionReasons['college/junk'] = (rejectionReasons['college/junk'] || 0) + 1;
      continue;
    }
    
    const matchResult = matchFingerprints(liveFp, compFp, listing.player);
    if (!matchResult.match) {
      rejectionReasons[matchResult.reason] = (rejectionReasons[matchResult.reason] || 0) + 1;
      if (rejectionCount < 3) {
        console.log(`    ✗ ${candidate.title.substring(0, 60)} (${matchResult.reason})`);
        rejectionCount++;
      }
      continue;
    }
    
    const score = scoreMatch(liveFp, compFp);
    scoredComps.push({
      price: candidate.price,
      title: candidate.title,
      score: score
    });
    
    console.log(`    ✓ $${candidate.price} (score:${score}) ${candidate.title.substring(0, 50)}`);
  }
  
  if (Object.keys(rejectionReasons).length > 0) {
    console.log('    Rejection summary:', rejectionReasons);
  }
  
  scoredComps.sort((a, b) => b.score - a.score);
  
  return scoredComps.slice(0, 10);
}

async function searchEbayListings(playerName) {
  try {
    const token = await getAccessToken();
    const keywords = `${playerName} prizm`;
    
    const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
    const params = {
      q: keywords,
      filter: 'price:[40..150],priceCurrency:USD,buyingOptions:{FIXED_PRICE}',
      limit: 50,
      sort: 'newlyListed'
    };

    console.log(`\n${playerName}:`);
    console.log(`  Query: "${keywords}"`);
    
    const response = await axios.get(url, {
      params: params,
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });
    
    console.log(`  API Response Status: ${response.status}`);
    
    if (!response.data || !response.data.itemSummaries) {
      console.log('  ✗ No items returned');
      return [];
    }

    const items = response.data.itemSummaries;
    const validCards = [];
    
    const counts = {
      total: items.length,
      playerFail: 0,
      collegeJunk: 0,
      noSet: 0,
      graded: 0,
      priceFail: 0,
      passed: 0
    };
    
    for (const item of items) {
      const title = item.title;
      
      if (!playerInTitle(playerName, title)) {
        counts.playerFail++;
        continue;
      }
      
      const fingerprint = parseCardTitle(title);
      
      if (fingerprint.isCollege || fingerprint.isJunk) {
        counts.collegeJunk++;
        continue;
      }
      
      if (!fingerprint.setName) {
        counts.noSet++;
        continue;
      }
      
      if (fingerprint.isGraded) {
        counts.graded++;
        continue;
      }
      
      const price = parseFloat(item.price.value);
      if (price < 40 || price > 150) {
        counts.priceFail++;
        continue;
      }
      
      counts.passed++;
      
      validCards.push({
        id: item.itemId,
        title: title,
        price: price,
        url: item.itemWebUrl,
        listingType: 'FixedPrice',
        location: item.itemLocation ? item.itemLocation.country : 'US',
        isRaw: true,
        player: playerName,
        listingDate: item.itemCreationDate || new Date().toISOString(),
        fingerprint: fingerprint
      });
    }
    
    console.log('  FILTER COUNTS:', counts);
    console.log(`  Valid cards: ${validCards.length}`);
    return validCards;
    
  } catch (error) {
    console.error(`  ERROR: ${error.message}`);
    return [];
  }
}

async function getCompCandidates(playerName, listingCard) {
  const fp = listingCard.fingerprint;
  
  // Cache key
  const cacheKey = [playerName, fp.setName, fp.year, fp.cardNumber, fp.parallel, fp.serial].join('|');
  
  if (compCache.has(cacheKey)) {
    console.log('  Using cached comps');
    return compCache.get(cacheKey);
  }
  
  try {
    const token = await getAccessToken();
    
    let keywords = playerName;
    if (fp.setName === 'PRIZM') keywords += ' prizm';
    else if (fp.setName === 'SELECT') keywords += ' select';
    else if (fp.setName === 'OPTIC') keywords += ' optic';
    else if (fp.setName === 'NATIONAL_TREASURES') keywords += ' national treasures';
    
    if (fp.year) keywords += ` ${fp.year}`;
    if (fp.cardNumber) keywords += ` #${fp.cardNumber}`;
    if (fp.parallel) keywords += ` ${fp.parallel.toLowerCase().replace(/_/g, ' ')}`;
    if (fp.serial) keywords += ` /${fp.serial}`;
    
    // Add negative keywords to reduce noise
    keywords += ' -college -collegiate -ncaa -draft -lot -break -repack -mystery -custom -reprint -psa -bgs -sgc -cgc -graded';
    
    const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
    const params = {
      q: keywords,
      filter: 'price:[20..200],priceCurrency:USD,buyingOptions:{FIXED_PRICE}',
      limit: 100,
      sort: 'newlyListed'
    };

    console.log(`  Comp query: "${keywords}"`);
    
    const response = await axios.get(url, {
      params: params,
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });
    
    if (!response.data || !response.data.itemSummaries) {
      console.log('  No candidates');
      compCache.set(cacheKey, []);
      return [];
    }

    const items = response.data.itemSummaries;
    console.log(`  Candidates fetched: ${items.length}`);
    
    const candidates = [];
    for (const item of items) {
      if (item.itemId === listingCard.id) continue;
      
      const price = parseFloat(item.price.value);
      candidates.push({
        price: price,
        title: item.title
      });
    }
    
    compCache.set(cacheKey, candidates);
    return candidates;
  } catch (error) {
    console.error(`  Comp error: ${error.message}`);
    compCache.set(cacheKey, []);
    return [];
  }
}

function evaluateDeal(listing, comps) {
  const fp = listing.fingerprint;
  console.log(`  Card: ${fp.year || '????'} ${fp.setName}${fp.cardNumber ? ' #' + fp.cardNumber : ''}${fp.serial ? ' /' + fp.serial : ''}${fp.parallel ? ' ' + fp.parallel : ''}`);
  console.log(`  Accepted comps: ${comps.length}`);
  
  if (comps.length < 3) {
    console.log(`  ⚠ Need 3+ comps (have ${comps.length})`);
    return null;
  }
  
  const prices = comps.map(c => c.price);
  const baseline = calculateFloorMedian(prices);
  const ratio = listing.price / baseline;

  console.log(`  Floor median: $${baseline.toFixed(2)}  Listing: $${listing.price}  Ratio: ${(ratio * 100).toFixed(1)}%`);

  if (ratio <= 0.92) {
    const percentBelow = ((1 - ratio) * 100).toFixed(1);
    console.log(`  🎯 DEAL! ${percentBelow}% below floor median`);
    
    return {
      id: listing.id,
      title: listing.title,
      price: listing.price,
      url: listing.url,
      listingType: listing.listingType,
      location: listing.location,
      isRaw: listing.isRaw,
      player: listing.player,
      listingDate: listing.listingDate,
      medianPrice: baseline.toFixed(2),
      percentUnder: percentBelow,
      compsUsed: comps.length,
      referenceListings: comps.slice(0, 3).map(c => c.title),
      timestamp: new Date().toISOString()
    };
  }
  
  return null;
}

app.post('/api/scan', async (req, res) => {
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
    return res.status(400).json({ 
      success: false, 
      error: 'eBay API not configured' 
    });
  }

  const selectedPlayers = req.body.players || [];
  
  if (selectedPlayers.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No players selected'
    });
  }

  console.log('\n========== CARDSNIPE SCAN ==========');
  console.log('MODE: Floor Median Comparison');
  console.log('THRESHOLD: ≤92% of floor median (lowest 10 comps)\n');
  
  compCache.clear(); // Clear cache at start of scan
  
  const deals = [];
  const errors = [];

  try {
    for (const player of selectedPlayers) {
      try {
        const listings = await searchEbayListings(player);
        
        for (const listing of listings) {
          console.log(`\n  Checking: ${listing.title.substring(0, 70)}`);
          
          const candidates = await getCompCandidates(player, listing);
          const comps = pickComps(listing, candidates);
          const deal = evaluateDeal(listing, comps);
          
          if (deal) {
            deals.push(deal);
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        console.error(`ERROR: ${player} - ${error.message}`);
        errors.push({ player: player, error: error.message });
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
  console.log(`CardSnipe server running on port ${PORT}`);
  console.log(`eBay API configured: ${!!(EBAY_CLIENT_ID && EBAY_CLIENT_SECRET)}`);
});
