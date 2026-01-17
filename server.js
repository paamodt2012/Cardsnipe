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

function isGradedCard(title) {
  const titleLower = title.toLowerCase();
  return titleLower.indexOf('psa') !== -1 || 
         titleLower.indexOf('bgs') !== -1 || 
         titleLower.indexOf('sgc') !== -1 ||
         titleLower.indexOf('cgc') !== -1 ||
         titleLower.indexOf('graded') !== -1 ||
         titleLower.indexOf('slab') !== -1 ||
         titleLower.indexOf('gem mint') !== -1 ||
         titleLower.match(/\b(9\.5|10)\b/) !== null;
}

function isCollegeCard(title) {
  const titleLower = title.toLowerCase();
  const collegeKeywords = ['college', 'ncaa', 'duke', 'kansas', 'kentucky', 'unc', 'ucla', 'freshman', 'sophomore'];
  return collegeKeywords.some(function(keyword) { return titleLower.indexOf(keyword) !== -1; });
}

function extractCardAttributes(title) {
  const titleLower = title.toLowerCase();
  
  const yearMatch = title.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? yearMatch[0] : null;
  
  const numberedMatch = title.match(/\/(\d+)/);
  const numbered = numberedMatch ? numberedMatch[1] : null;
  
  const sets = ['prizm', 'select', 'optic', 'national treasures'];
  const set = sets.find(function(s) { return titleLower.indexOf(s) !== -1; }) || null;
  
  const colors = ['red', 'blue', 'green', 'gold', 'silver', 'orange', 'purple', 'pink', 'black', 'white', 'yellow', 'teal'];
  const color = colors.find(function(c) { return titleLower.indexOf(c) !== -1; }) || null;
  
  const variants = ['base', 'rookie', 'rc', 'parallel', 'refractor', 'chrome', 'hyper', 'disco', 'neon', 'tiger', 'prizm', 'wave'];
  const variant = variants.find(function(v) { return titleLower.indexOf(v) !== -1; }) || null;
  
  const isRookie = titleLower.indexOf('rookie') !== -1 || titleLower.indexOf(' rc') !== -1 || titleLower.indexOf(' rc ') !== -1;
  
  return {
    year: year,
    numbered: numbered,
    set: set,
    color: color,
    variant: variant,
    isRookie: isRookie,
    title: title
  };
}

function cardsMatch(card1Title, card2Title) {
  if (isGradedCard(card1Title) !== isGradedCard(card2Title)) {
    return false;
  }
  
  if (isCollegeCard(card1Title) !== isCollegeCard(card2Title)) {
    return false;
  }
  
  const attrs1 = extractCardAttributes(card1Title);
  const attrs2 = extractCardAttributes(card2Title);
  
  if (attrs1.isRookie !== attrs2.isRookie) {
    return false;
  }
  
  let matches = 0;
  let totalChecks = 0;
  
  if (attrs1.year && attrs2.year) {
    totalChecks++;
    if (attrs1.year === attrs2.year) matches++;
  }
  
  if (attrs1.set && attrs2.set) {
    totalChecks++;
    if (attrs1.set === attrs2.set) matches++;
  }
  
  if (attrs1.numbered && attrs2.numbered) {
    totalChecks++;
    if (attrs1.numbered === attrs2.numbered) matches++;
  }
  
  if (attrs1.color && attrs2.color) {
    totalChecks++;
    if (attrs1.color === attrs2.color) matches++;
  }
  
  if (totalChecks === 0) {
    if (attrs1.set === attrs2.set && attrs1.set !== null) {
      return true;
    }
    return false;
  }
  
  const matchPercentage = matches / totalChecks;
  return matchPercentage >= 0.7;
}

async function searchEbayListings(playerName) {
  try {
    const token = await getAccessToken();
    const keywords = playerName + ' card -psa -bgs -sgc -cgc -graded -slab -auto -lot -break -autograph -college -ncaa';
    
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
      
      if (isGradedCard(title)) continue;
      if (isCollegeCard(title)) continue;
      
      const titleLower = title.toLowerCase();
      
      const hasJunk = titleLower.indexOf('lot') !== -1 || titleLower.indexOf('break') !== -1;
      if (hasJunk) continue;
      
      const hasPrizm = titleLower.indexOf('prizm') !== -1;
      const hasSelect = titleLower.indexOf('select') !== -1;
      const hasOptic = titleLower.indexOf('optic') !== -1;
      const hasNT = titleLower.indexOf('national treasures') !== -1 || titleLower.indexOf('national treasure') !== -1;
      
      if (!hasPrizm && !hasSelect && !hasOptic && !hasNT) continue;
      
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
        attributes: extractCardAttributes(title)
      });
    }
    
    console.log('  Valid cards: ' + validCards.length);
    return validCards;
    
  } catch (error) {
    console.error('  ERROR: ' + error.message);
    return [];
  }
}

async function getSoldPrices(playerName, listingCard) {
  try {
    const token = await getAccessToken();
    const keywords = playerName + ' card -psa -bgs -sgc -cgc -graded -slab -college -ncaa';
    
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

    const response = await axios.get(url, {
      params: params,
      headers: {
        'Authorization': 'Bearer ' + token,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });
    
    if (!response.data || !response.data.itemSummaries) {
      return [];
    }

    const items = response.data.itemSummaries;
    const matchingSold = [];
    
    for (let i = 0; i < items.length && matchingSold.length < 5; i++) {
      const item = items[i];
      const title = item.title;
      
      if (isGradedCard(title)) continue;
      if (isCollegeCard(title)) continue;
      
      if (cardsMatch(listingCard.title, title)) {
        const price = parseFloat(item.price.value);
        matchingSold.push({ 
          price: price, 
          date: item.itemEndDate || new Date().toISOString(), 
          title: title 
        });
      }
    }

    return matchingSold;
  } catch (error) {
    console.error('  Sold search error: ' + error.message);
    return [];
  }
}

function evaluateDeal(listing, soldPrices) {
  if (soldPrices.length < 1) {
    return null;
  }
  
  const total = soldPrices.reduce(function(sum, item) { return sum + item.price; }, 0);
  const avgSoldPrice = total / soldPrices.length;
  const percentOfMarket = listing.price / avgSoldPrice;

  if (percentOfMarket <= 0.80) {
    const percentBelow = ((1 - percentOfMarket) * 100).toFixed(1);
    console.log('  >>> DEAL: $' + listing.price + ' vs $' + avgSoldPrice.toFixed(2) + ' (' + percentBelow + '% off)');
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
      avgSoldPrice: avgSoldPrice.toFixed(2),
      percentUnder: percentBelow,
      soldComps: soldPrices.map(function(s) { return s.title; }),
      timestamp: new Date().toISOString()
    };
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

  console.log('\n========== CARDSNIPE SCAN (Browse API) ==========');
  console.log('SETS: Prizm, Select, Optic, National Treasures');
  console.log('RAW ONLY: No graded/slab, no college');
  console.log('PRICE: $40-$150');
  console.log('COMPS: Strict matching (graded/raw, college/pro, rookie status)');
  console.log('THRESHOLD: ≤80%\n');
  
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
            await new Promise(function(resolve) { setTimeout(resolve, 500); });
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
  console.log('Using eBay Browse API v1 (Finding API deprecated)');
  console.log('eBay API configured: ' + !!(EBAY_CLIENT_ID && EBAY_CLIENT_SECRET));
});
