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

const COLLEGE_KEYWORDS = ['college', 'collegiate', 'ncaa', 'draft picks', 'university', 'freshman', 'sophomore', 'contenders draft', 'bowman u', 'duke', 'kansas', 'kentucky', 'unc', 'ucla', 'usc'];
const JUNK_KEYWORDS = ['lot', 'break', 'case break', 'repack', 'mystery', 'digital', 'custom', 'reprint'];
const GRADED_KEYWORDS = ['psa', 'bgs', 'sgc', 'cgc', 'graded', 'slab', 'gem mint'];
const PARALLEL_KEYWORDS = ['silver', 'holo', 'disco', 'scope', 'mojo', 'cracked ice', 'zebra', 'tiger', 'pink', 'gold', 'orange', 'blue', 'red', 'green', 'purple', 'prizm', 'shimmer', 'wave', 'camo', 'tie dye', 'choice', 'premier level'];

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
    console.error('✗ Failed to get access token: ' + error.message);
    throw error;
  }
}

function parseCardTitle(title) {
  const titleLower = title.toLowerCase();
  
  const isCollege = COLLEGE_KEYWORDS.some(function(kw) { return titleLower.indexOf(kw) !== -1; });
  if (isCollege) {
    return { isCollege: true };
  }
  
  const isJunk = JUNK_KEYWORDS.some(function(kw) { return titleLower.indexOf(kw) !== -1; });
  if (isJunk) {
    return { isJunk: true };
  }
  
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
  
  if (!year) {
    return { noYear: true };
  }
  
  const cardNumberMatch = title.match(/#(\d+)|no\.?\s*(\d+)/i);
  const cardNumber = cardNumberMatch ? (cardNumberMatch[1] || cardNumberMatch[2]) : null;
  
  const serialMatch = title.match(/\/(\d+)|out of (\d+)|##\/(\d+)/i);
  const serial = serialMatch ? (serialMatch[1] || serialMatch[2] || serialMatch[3]) : null;
  
  const isRookie = titleLower.indexOf('rookie') !== -1 || titleLower.indexOf(' rc') !== -1 || titleLower.indexOf(' rc ') !== -1;
  
  let parallel = null;
  for (let i = 0; i < PARALLEL_KEYWORDS.length; i++) {
    if (titleLower.indexOf(PARALLEL_KEYWORDS[i]) !== -1) {
      parallel = PARALLEL_KEYWORDS[i];
      break;
    }
  }
  
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
  
  return {
    isCollege: false,
    isJunk: false,
    setName: setName,
    year: year,
    cardNumber: cardNumber,
    serial: serial,
    isRookie: isRookie,
    parallel: parallel,
    isGraded: isGraded,
    grader: grader,
    grade: grade,
    title: title
  };
}

function fingerprintsMatch(live, sold) {
  if (!live.year || !sold.year) {
    return { match: false, reason: 'missing year' };
  }
  
  if (live.year !== sold.year) {
    return { match: false, reason: 'year mismatch (' + live.year + ' vs ' + sold.year + ')' };
  }
  
  if (live.setName !== sold.setName) {
    return { match: false, reason: 'set mismatch (' + live.setName + ' vs ' + sold.setName + ')' };
  }
  
  if (live.isRookie !== sold.isRookie) {
    return { match: false, reason: 'rookie status mismatch' };
  }
  
  if (live.isGraded !== sold.isGraded) {
    return { match: false, reason: 'graded status mismatch (live: ' + live.isGraded + ', sold: ' + sold.isGraded + ')' };
  }
  
  if (live.isGraded && sold.isGraded) {
    if (live.grader !== sold.grader) {
      return { match: false, reason: 'grader mismatch (' + live.grader + ' vs ' + sold.grader + ')' };
    }
    if (live.grade && sold.grade && live.grade !== sold.grade) {
      return { match: false, reason: 'grade mismatch (' + live.grade + ' vs ' + sold.grade + ')' };
    }
  }
  
  if (live.cardNumber && sold.cardNumber && live.cardNumber !== sold.cardNumber) {
    return { match: false, reason: 'card number mismatch (#' + live.cardNumber + ' vs #' + sold.cardNumber + ')' };
  }
  
  if (live.serial && sold.serial && live.serial !== sold.serial) {
    return { match: false, reason: 'serial mismatch (/' + live.serial + ' vs /' + sold.serial + ')' };
  }
  
  if (live.parallel && sold.parallel && live.parallel !== sold.parallel) {
    return { match: false, reason: 'parallel mismatch (' + live.parallel + ' vs ' + sold.parallel + ')' };
  }
  
  if (live.parallel && !sold.parallel) {
    return { match: false, reason: 'live has parallel "' + live.parallel + '" but sold does not' };
  }
  
  return { match: true };
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

async function searchEbayListings(playerName) {
  try {
    const token = await getAccessToken();
    const keywords = playerName + ' card prizm select optic national treasures -college -ncaa -draft -lot -break -psa -bgs -sgc -cgc -graded';
    
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
      const fingerprint = parseCardTitle(title);
      
      if (fingerprint.isCollege) {
        continue;
      }
      
      if (fingerprint.isJunk) {
        continue;
      }
      
      if (fingerprint.noYear) {
        continue;
      }
      
      if (!fingerprint.setName) {
        continue;
      }
      
      if (fingerprint.isGraded) {
        continue;
      }
      
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
    
    console.log('  Valid cards after filtering: ' + validCards.length);
    return validCards;
    
  } catch (error) {
    console.error('  ERROR: ' + error.message);
    return [];
  }
}

async function getSoldPrices(playerName, listingCard) {
  try {
    const token = await getAccessToken();
    const fp = listingCard.fingerprint;
    
    let keywords = playerName + ' card';
    if (fp.setName === 'PRIZM') keywords += ' prizm';
    else if (fp.setName === 'SELECT') keywords += ' select';
    else if (fp.setName === 'OPTIC') keywords += ' optic';
    else if (fp.setName === 'NATIONAL_TREASURES') keywords += ' national treasures';
    
    if (fp.year) keywords += ' ' + fp.year;
    if (fp.cardNumber) keywords += ' #' + fp.cardNumber;
    if (fp.parallel) keywords += ' ' + fp.parallel;
    if (fp.serial) keywords += ' /' + fp.serial;
    
    keywords += ' -college -ncaa -draft -lot -break -psa -bgs -sgc -cgc -graded';
    
    const today = new Date();
    const sixtyDaysAgo = new Date(today.getTime() - (60 * 24 * 60 * 60 * 1000));
    const dateFormat = function(d) {
      return d.toISOString().split('T')[0];
    };
    
    const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
    const params = {
      q: keywords,
      filter: 'price:[30..200],priceCurrency:USD,conditions:{NEW|USED},last_sold_date:[' + dateFormat(sixtyDaysAgo) + '..' + dateFormat(today) + ']',
      fieldgroups: 'EXTENDED',
      limit: 50
    };

    console.log('  Sold query: ' + keywords);
    
    const response = await axios.get(url, {
      params: params,
      headers: {
        'Authorization': 'Bearer ' + token,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });
    
    if (!response.data || !response.data.itemSummaries) {
      console.log('  No sold comps found');
      return [];
    }

    const items = response.data.itemSummaries;
    console.log('  Sold comps fetched: ' + items.length);
    
    const matchingSold = [];
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const title = item.title;
      const soldFp = parseCardTitle(title);
      
      if (soldFp.isCollege) {
        console.log('  Rejected (college): ' + title.substring(0, 60));
        continue;
      }
      
      if (soldFp.isJunk) {
        console.log('  Rejected (junk): ' + title.substring(0, 60));
        continue;
      }
      
      if (soldFp.noYear) {
        console.log('  Rejected (no year): ' + title.substring(0, 60));
        continue;
      }
      
      const matchResult = fingerprintsMatch(fp, soldFp);
      if (!matchResult.match) {
        console.log('  Rejected (' + matchResult.reason + '): ' + title.substring(0, 60));
        continue;
      }
      
      const price = parseFloat(item.price.value);
      matchingSold.push({ 
        price: price, 
        date: item.itemEndDate || new Date().toISOString(), 
        title: title 
      });
      
      console.log('  ✓ ACCEPTED comp: $' + price + ' - ' + title.substring(0, 60));
      
      if (matchingSold.length >= 8) break;
    }

    console.log('  Total accepted comps: ' + matchingSold.length);
    return matchingSold;
  } catch (error) {
    console.error('  Sold search error: ' + error.message);
    return [];
  }
}

function evaluateDeal(listing, soldPrices) {
  if (soldPrices.length < 3) {
    console.log('  Skipped (need 3+ comps, have ' + soldPrices.length + ')');
    return null;
  }
  
  const prices = soldPrices.map(function(s) { return s.price; });
  const medianSoldPrice = calculateMedian(prices);
  const percentOfMarket = listing.price / medianSoldPrice;

  if (percentOfMarket <= 0.70) {
    const percentBelow = ((1 - percentOfMarket) * 100).toFixed(1);
    console.log('  >>> DEAL FOUND! $' + listing.price + ' vs median $' + medianSoldPrice.toFixed(2) + ' (' + percentBelow + '% off)');
    console.log('      ' + listing.title.substring(0, 70));
    
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
      medianSoldPrice: medianSoldPrice.toFixed(2),
      percentUnder: percentBelow,
      compsUsed: soldPrices.length,
      soldComps: soldPrices.map(function(s) { return s.title; }),
      timestamp: new Date().toISOString()
    };
  } else {
    console.log('  Not a deal: $' + listing.price + ' vs median $' + medianSoldPrice.toFixed(2) + ' (' + (percentOfMarket * 100).toFixed(0) + '% of market)');
  }
  
  return null;
}

app.post('/api/scan', async function(req, res) {
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
    return res.status(400).json({ 
      success: false, 
      error: 'eBay API not configured. Need both CLIENT_ID and CLIENT_SECRET' 
    });
  }

  const selectedPlayers = req.body.players || [];
  
  if (selectedPlayers.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No players selected'
    });
  }

  console.log('\n========== CARDSNIPE SCAN (STRICT MATCHING) ==========');
  console.log('SETS: Prizm, Select, Optic, National Treasures (PRO ONLY)');
  console.log('RAW ONLY: No graded cards');
  console.log('PRICE: $40-$150');
  console.log('COMPS: Minimum 3 strict matches required');
  console.log('THRESHOLD: ≤70% of MEDIAN sold price\n');
  
  const deals = [];
  const errors = [];

  try {
    console.log('Scanning ' + selectedPlayers.length + ' selected players...');

    for (let i = 0; i < selectedPlayers.length; i++) {
      const player = selectedPlayers[i];
      
      try {
        const listings = await searchEbayListings(player);
        
        if (listings.length > 0) {
          for (let j = 0; j < listings.length; j++) {
            const soldPrices = await getSoldPrices(player, listings[j]);
            const deal = evaluateDeal(listings[j], soldPrices);
            if (deal) {
              deals.push(deal);
            }
            await new Promise(function(resolve) { setTimeout(resolve, 800); });
          }
        }

        await new Promise(function(resolve) { setTimeout(resolve, 1500); });
      } catch (error) {
        console.error('ERROR: ' + player + ' - ' + error.message);
        errors.push({ player: player, error: error.message });
      }
    }

    console.log('\n========== SCAN COMPLETE ==========');
    console.log('DEALS FOUND: ' + deals.length);
    console.log('Players scanned: ' + selectedPlayers.length + '\n');

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
    api: 'Browse API v1',
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
  console.log('Using eBay Browse API v1 with STRICT matching');
  console.log('eBay API configured: ' + !!(EBAY_CLIENT_ID && EBAY_CLIENT_SECRET));
});
