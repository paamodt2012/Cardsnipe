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
  'Victor Wembanyama': ['wemby', 'wembanyama', 'victor'],
  'Anthony Edwards': ['ant', 'antman', 'ant man', 'edwards', 'anthony'],
  'Shai Gilgeous-Alexander': ['sga', 'shai', 'gilgeous', 'alexander'],
  'Amon-Ra St Brown': ['amon ra', 'amon-ra', 'st brown', 'sun god']
};

const COLLEGE_KEYWORDS = ['college', 'collegiate', 'ncaa', 'draft picks', 'draft pick', 'university', 'contenders draft', 'bowman u'];
const JUNK_KEYWORDS = ['lot', 'break', 'case break', 'repack', 'mystery', 'digital', 'custom', 'reprint', 'lot of'];
const GRADED_KEYWORDS = ['psa', 'bgs', 'sgc', 'cgc', 'graded', 'slab', 'gem mint'];

const PARALLEL_MAP = {
  'silver prizm': 'SILVER',
  'prizm silver': 'SILVER',
  'silver': 'SILVER',
  'blue wave': 'BLUE_WAVE',
  'red wave': 'RED_WAVE',
  'green wave': 'GREEN_WAVE',
  'purple wave': 'PURPLE_WAVE',
  'tiger stripe': 'TIGER',
  'tiger': 'TIGER',
  'zebra': 'ZEBRA',
  'gold shimmer': 'GOLD_SHIMMER',
  'pink ice': 'PINK_ICE',
  'orange ice': 'ORANGE_ICE',
  'cracked ice': 'CRACKED_ICE',
  'disco': 'DISCO',
  'scope': 'SCOPE',
  'holo': 'HOLO',
  'mojo': 'MOJO'
};

const STRONG_PARALLELS = ['TIGER', 'ZEBRA', 'GOLD_SHIMMER', 'PINK_ICE', 'ORANGE_ICE', 'CRACKED_ICE'];

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
    console.error('✗ Token error: ' + error.message);
    throw error;
  }
}

function getPlayerVariants(playerName) {
  const variants = [playerName.toLowerCase()];
  const parts = playerName.toLowerCase().split(' ').filter(function(p) { return p.length > 1; });
  
  if (parts.length >= 2) {
    variants.push(parts[parts.length - 1]);
  }
  
  if (PLAYER_ALIASES[playerName]) {
    variants.push.apply(variants, PLAYER_ALIASES[playerName]);
  }
  
  return variants;
}

function playerInTitle(playerName, title) {
  const titleLower = title.toLowerCase();
  const variants = getPlayerVariants(playerName);
  
  for (let i = 0; i < variants.length; i++) {
    if (titleLower.indexOf(variants[i]) !== -1) {
      return true;
    }
  }
  
  return false;
}

function isCollegeTitle(title) {
  const lower = title.toLowerCase();
  return COLLEGE_KEYWORDS.some(function(kw) { return lower.indexOf(kw) !== -1; });
}

function isJunkTitle(title) {
  const lower = title.toLowerCase();
  return JUNK_KEYWORDS.some(function(kw) { return lower.indexOf(kw) !== -1; });
}

function normalizeParallel(title) {
  const titleLower = title.toLowerCase();
  
  for (let key in PARALLEL_MAP) {
    if (titleLower.indexOf(key) !== -1) {
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
  if (titleLower.indexOf('national treasures') !== -1 || titleLower.indexOf('national treasure') !== -1) {
    setName = 'NATIONAL_TREASURES';
  } else if (titleLower.indexOf('prizm') !== -1) {
    if (titleLower.indexOf('draft') !== -1) {
      return { isCollege: true };
    }
    setName = 'PRIZM';
  } else if (titleLower.indexOf('select') !== -1) {
    if (titleLower.indexOf('draft') !== -1) {
      return { isCollege: true };
    }
    setName = 'SELECT';
  } else if (titleLower.indexOf('optic') !== -1) {
    setName = 'OPTIC';
  }
  
  const yearMatch = title.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : null;
  
  const cardNumberMatch = title.match(/#(\d+)|no\.?\s*(\d+)/i);
  const cardNumber = cardNumberMatch ? (cardNumberMatch[1] || cardNumberMatch[2]) : null;
  
  const serialMatch = title.match(/\/(\d+)|out of (\d+)|##\/(\d+)/i);
  const serial = serialMatch ? (serialMatch[1] || serialMatch[2] || serialMatch[3]) : null;
  
  const isRookie = titleLower.indexOf('rookie') !== -1 || titleLower.indexOf(' rc') !== -1 || titleLower.indexOf(' rc ') !== -1;
  
  const parallel = normalizeParallel(title);
  
  let isGraded = false;
  let grader = null;
  let grade = null;
  
  for (let i = 0; i < GRADED_KEYWORDS.length; i++) {
    if (titleLower.indexOf(GRADED_KEYWORDS[i]) !== -1) {
      isGraded = true;
      break;
    }
  }
  
  if (isGraded) {
    if (titleLower.indexOf('psa') !== -1) grader = 'PSA';
    else if (titleLower.indexOf('bgs') !== -1) grader = 'BGS';
    else if (titleLower.indexOf('sgc') !== -1) grader = 'SGC';
    else if (titleLower.indexOf('cgc') !== -1) grader = 'CGC';
    
    const gradeMatch = title.match(/\b(10|9\.5|9|8\.5|8)\b/);
    grade = gradeMatch ? gradeMatch[1] : null;
  }
  
  const hasAnchor = !!(cardNumber || serial || parallel);
  
  return {
    isCollege: isCollege,
    isJunk: isJunk,
    setName: setName,
    year: year,
    cardNumber: cardNumber,
    serial: serial,
    parallel: parallel,
    isRookie: isRookie,
    isGraded: isGraded,
    grader: grader,
    grade: grade,
    hasAnchor: hasAnchor,
    title: title
  };
}

function matchFingerprints(live, comp, livePlayerName) {
  if (!playerInTitle(livePlayerName, comp.title)) {
    return { match: false, reason: 'player name not found' };
  }
  
  if (live.isCollege || comp.isCollege) {
    return { match: false, reason: 'college card' };
  }
  
  if (live.setName !== comp.setName) {
    return { match: false, reason: 'set mismatch' };
  }
  
  if (live.isGraded !== comp.isGraded) {
    return { match: false, reason: 'graded mismatch' };
  }
  
  if (live.serial) {
    if (!comp.serial || live.serial !== comp.serial) {
      return { match: false, reason: 'serial mismatch' };
    }
  }
  
  if (live.parallel && STRONG_PARALLELS.indexOf(live.parallel) !== -1) {
    if (live.parallel !== comp.parallel) {
      return { match: false, reason: 'strong parallel mismatch' };
    }
  }
  
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
    score += 1;
  }
  
  return score;
}

function calculateMedian(prices) {
  if (prices.length === 0) return 0;
  const sorted = prices.slice().sort(function(a, b) { return a - b; });
  
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function pickComps(listing, candidates) {
  const liveFp = listing.fingerprint;
  const scoredComps = [];
  
  let rejectionCount = 0;
  
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const compFp = parseCardTitle(candidate.title);
    
    if (compFp.isCollege || compFp.isJunk) {
      if (rejectionCount < 5) {
        console.log('    ✗ ' + candidate.title.substring(0, 60) + ' (college/junk)');
        rejectionCount++;
      }
      continue;
    }
    
    const matchResult = matchFingerprints(liveFp, compFp, listing.player);
    if (!matchResult.match) {
      if (rejectionCount < 5) {
        console.log('    ✗ ' + candidate.title.substring(0, 60) + ' (' + matchResult.reason + ')');
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
    
    console.log('    ✓ $' + candidate.price + ' (score:' + score + ') ' + candidate.title.substring(0, 50));
  }
  
  if (rejectionCount >= 5) {
    console.log('    ... +' + (candidates.length - scoredComps.length - rejectionCount) + ' more rejected');
  }
  
  scoredComps.sort(function(a, b) { return b.score - a.score; });
  
  return scoredComps.slice(0, 10);
}

async function searchEbayListings(playerName) {
  try {
    const token = await getAccessToken();
    const keywords = playerName + ' prizm select optic national treasures';
    
    const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
    const params = {
      q: keywords,
      filter: 'price:[40..150],priceCurrency:USD,buyingOptions:{FIXED_PRICE}',
      limit: 100,
      sort: 'newlyListed'
    };

    console.log('\n' + playerName + ':');
    
    const response = await axios.get(url, {
      params: params,
      headers: {
        'Authorization': 'Bearer ' + token,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });
    
    if (!response.data || !response.data.itemSummaries) {
      console.log('  No results');
      return [];
    }

    const items = response.data.itemSummaries;
    const validCards = [];
    
    console.log('  Raw results: ' + items.length);
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const title = item.title;
      
      if (!playerInTitle(playerName, title)) continue;
      
      const fingerprint = parseCardTitle(title);
      
      if (fingerprint.isCollege || fingerprint.isJunk) continue;
      if (!fingerprint.setName) continue;
      if (fingerprint.isGraded) continue;
      if (!fingerprint.hasAnchor) continue;
      
      const price = parseFloat(item.price.value);
      if (price < 40 || price > 150) continue;
      
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
    
    console.log('  Valid cards: ' + validCards.length);
    return validCards;
    
  } catch (error) {
    console.error('  ERROR: ' + error.message);
    return [];
  }
}

async function getCompCandidates(playerName, listingCard) {
  try {
    const token = await getAccessToken();
    const fp = listingCard.fingerprint;
    
    let keywords = playerName;
    if (fp.setName === 'PRIZM') keywords += ' prizm';
    else if (fp.setName === 'SELECT') keywords += ' select';
    else if (fp.setName === 'OPTIC') keywords += ' optic';
    else if (fp.setName === 'NATIONAL_TREASURES') keywords += ' national treasures';
    
    if (fp.year) keywords += ' ' + fp.year;
    if (fp.cardNumber) keywords += ' #' + fp.cardNumber;
    
    const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
    const params = {
      q: keywords,
      filter: 'price:[20..200],priceCurrency:USD,buyingOptions:{FIXED_PRICE}',
      limit: 100,
      sort: 'newlyListed'
    };

    console.log('  Comp query: "' + keywords + '"');
    
    const response = await axios.get(url, {
      params: params,
      headers: {
        'Authorization': 'Bearer ' + token,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });
    
    if (!response.data || !response.data.itemSummaries) {
      console.log('  No candidates');
      return [];
    }

    const items = response.data.itemSummaries;
    console.log('  Candidates fetched: ' + items.length);
    
    const candidates = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.itemId === listingCard.id) continue;
      
      const price = parseFloat(item.price.value);
      candidates.push({
        price: price,
        title: item.title
      });
    }
    
    return candidates;
  } catch (error) {
    console.error('  Comp error: ' + error.message);
    return [];
  }
}

function evaluateDeal(listing, comps) {
  const fp = listing.fingerprint;
  console.log('  Card: ' + fp.year + ' ' + fp.setName + (fp.cardNumber ? ' #' + fp.cardNumber : '') + (fp.serial ? ' /' + fp.serial : '') + (fp.parallel ? ' ' + fp.parallel : ''));
  console.log('  Accepted comps: ' + comps.length);
  
  if (comps.length < 3) {
    console.log('  ⚠ Need 3+ comps (have ' + comps.length + ')');
    return null;
  }
  
  const prices = comps.map(function(c) { return c.price; });
  const medianPrice = calculateMedian(prices);
  const percentOfMedian = listing.price / medianPrice;

  console.log('  Median: $' + medianPrice.toFixed(2) + '  Listing: $' + listing.price + '  Ratio: ' + (percentOfMedian * 100).toFixed(1) + '%');

  if (percentOfMedian <= 0.88) {
    const percentBelow = ((1 - percentOfMedian) * 100).toFixed(1);
    console.log('  🎯 DEAL! ' + percentBelow + '% below median');
    
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
      medianPrice: medianPrice.toFixed(2),
      percentUnder: percentBelow,
      compsUsed: comps.length,
      referenceListings: comps.slice(0, 3).map(function(c) { return c.title; }),
      timestamp: new Date().toISOString()
    };
  }
  
  return null;
}

app.post('/api/scan', async function(req, res) {
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
  console.log('MODE: Market Median Comparison');
  console.log('THRESHOLD: ≤88% of median comparable BINs\n');
  
  const deals = [];
  const errors = [];

  try {
    for (let i = 0; i < selectedPlayers.length; i++) {
      const player = selectedPlayers[i];
      
      try {
        const listings = await searchEbayListings(player);
        
        for (let j = 0; j < listings.length; j++) {
          const listing = listings[j];
          console.log('\n  Checking: ' + listing.title.substring(0, 70));
          
          const candidates = await getCompCandidates(player, listing);
          const comps = pickComps(listing, candidates);
          const deal = evaluateDeal(listing, comps);
          
          if (deal) {
            deals.push(deal);
          }
          
          await new Promise(function(resolve) { setTimeout(resolve, 1000); });
        }

        await new Promise(function(resolve) { setTimeout(resolve, 1500); });
      } catch (error) {
        console.error('ERROR: ' + player + ' - ' + error.message);
        errors.push({ player: player, error: error.message });
      }
    }

    console.log('\n========== COMPLETE ==========');
    console.log('DEALS: ' + deals.length + '\n');

    res.json({ 
      success: true, 
      deals: deals,
      scanned: selectedPlayers.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('FATAL: ' + error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/health', function(req, res) {
  res.json({ 
    status: 'ok', 
    configured: !!(EBAY_CLIENT_ID && EBAY_CLIENT_SECRET),
    timestamp: new Date().toISOString() 
  });
});

app.get('/api/players', function(req, res) {
  res.json(TRACKED_PLAYERS);
});

app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('CardSnipe server running on port ' + PORT);
  console.log('eBay API configured: ' + !!(EBAY_CLIENT_ID && EBAY_CLIENT_SECRET));
});
