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

async function searchEbayListings(playerName) {
  try {
    const keywords = playerName + ' (Prizm,Select,Optic,"National Treasures") -psa -bgs -sgc -cgc -graded -slab -auto -lot -break -autograph';
    
    const url = 'https://svcs.ebay.com/services/search/FindingService/v1';
    const params = {
      'OPERATION-NAME': 'findItemsByKeywords',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': EBAY_CLIENT_ID,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'keywords': keywords,
      'itemFilter(0).name': 'ListingType',
      'itemFilter(0).value(0)': 'FixedPrice',
      'itemFilter(1).name': 'MinPrice',
      'itemFilter(1).value': '50',
      'itemFilter(2).name': 'MaxPrice',
      'itemFilter(2).value': '150',
      'itemFilter(3).name': 'LocatedIn',
      'itemFilter(3).value': 'US',
      'paginationInput.entriesPerPage': '100',
      'sortOrder': 'StartTimeNewest'
    };

    console.log('\nSearching: ' + playerName);
    console.log('Keywords: ' + keywords);
    
    const response = await axios.get(url, { params: params });
    
    const findResponse = response.data.findItemsByKeywordsResponse;
    if (!findResponse || !findResponse[0] || !findResponse[0].searchResult || !findResponse[0].searchResult[0]) {
      console.log('  No valid response from eBay');
      return [];
    }
    
    const searchResult = findResponse[0].searchResult[0];
    const count = searchResult['@count'] || '0';
    
    console.log('  eBay returned: ' + count + ' listings');
    
    if (count === '0' || !searchResult.item) {
      console.log('  No items found');
      return [];
    }

    const items = searchResult.item;
    const validCards = [];
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const title = item.title[0];
      const titleLower = title.toLowerCase();
      
      const hasGraded = titleLower.indexOf('psa') !== -1 || 
                       titleLower.indexOf('bgs') !== -1 || 
                       titleLower.indexOf('sgc') !== -1 ||
                       titleLower.indexOf('cgc') !== -1 ||
                       titleLower.indexOf('graded') !== -1 ||
                       titleLower.indexOf('slab') !== -1;
      
      if (hasGraded) {
        continue;
      }
      
      const hasJunk = titleLower.indexOf('lot') !== -1 ||
                     titleLower.indexOf('break') !== -1 ||
                     titleLower.indexOf('auto') !== -1 ||
                     titleLower.indexOf('autograph') !== -1;
      
      if (hasJunk) {
        continue;
      }
      
      const hasPrizm = titleLower.indexOf('prizm') !== -1;
      const hasSelect = titleLower.indexOf('select') !== -1;
      const hasOptic = titleLower.indexOf('optic') !== -1;
      const hasNT = titleLower.indexOf('national treasures') !== -1 || titleLower.indexOf('national treasure') !== -1;
      
      if (!hasPrizm && !hasSelect && !hasOptic && !hasNT) {
        continue;
      }
      
      const price = parseFloat(item.sellingStatus[0].currentPrice[0].__value__);
      
      if (price < 50 || price > 150) {
        continue;
      }
      
      validCards.push({
        id: item.itemId[0],
        title: title,
        price: price,
        url: item.viewItemURL[0],
        listingType: item.listingInfo[0].listingType[0],
        location: item.location ? item.location[0] : 'US',
        isRaw: true,
        player: playerName,
        listingDate: item.listingInfo[0].startTime[0]
      });
    }
    
    console.log('  Valid liquid raw cards: ' + validCards.length);
    
    if (validCards.length > 0) {
      console.log('  Sample: [$' + validCards[0].price + '] ' + validCards[0].title.substring(0, 60));
    }
    
    return validCards;
    
  } catch (error) {
    console.error('ERROR searching ' + playerName + ': ' + error.message);
    return [];
  }
}

async function getSoldPrices(playerName) {
  try {
    const keywords = playerName + ' (Prizm,Select,Optic,"National Treasures") -psa -bgs -sgc -cgc -graded -slab';
    
    const url = 'https://svcs.ebay.com/services/search/FindingService/v1';
    const params = {
      'OPERATION-NAME': 'findCompletedItems',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': EBAY_CLIENT_ID,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'keywords': keywords,
      'itemFilter(0).name': 'SoldItemsOnly',
      'itemFilter(0).value': 'true',
      'itemFilter(1).name': 'MinPrice',
      'itemFilter(1).value': '50',
      'itemFilter(2).name': 'MaxPrice',
      'itemFilter(2).value': '200',
      'paginationInput.entriesPerPage': '20',
      'sortOrder': 'EndTimeSoonest'
    };

    const response = await axios.get(url, { params: params });
    
    const findResponse = response.data.findCompletedItemsResponse;
    if (!findResponse || !findResponse[0] || !findResponse[0].searchResult || !findResponse[0].searchResult[0]) {
      return [];
    }
    
    const searchResult = findResponse[0].searchResult[0];
    const count = searchResult['@count'] || '0';
    
    if (count === '0' || !searchResult.item) {
      return [];
    }

    const items = searchResult.item;
    const soldPrices = [];
    
    for (let i = 0; i < items.length && soldPrices.length < 5; i++) {
      const item = items[i];
      const titleLower = item.title[0].toLowerCase();
      
      const hasGraded = titleLower.indexOf('psa') !== -1 || 
                       titleLower.indexOf('bgs') !== -1 || 
                       titleLower.indexOf('sgc') !== -1 ||
                       titleLower.indexOf('cgc') !== -1;
      
      if (hasGraded) {
        continue;
      }
      
      const hasPrizm = titleLower.indexOf('prizm') !== -1;
      const hasSelect = titleLower.indexOf('select') !== -1;
      const hasOptic = titleLower.indexOf('optic') !== -1;
      const hasNT = titleLower.indexOf('national treasures') !== -1;
      
      if (!hasPrizm && !hasSelect && !hasOptic && !hasNT) {
        continue;
      }
      
      const price = parseFloat(item.sellingStatus[0].currentPrice[0].__value__);
      soldPrices.push({ price: price, date: item.listingInfo[0].endTime[0] });
    }

    if (soldPrices.length > 0) {
      const total = soldPrices.reduce(function(sum, item) { return sum + item.price; }, 0);
      const avg = (total / soldPrices.length).toFixed(2);
      console.log('  Avg sold (liquid raw): $' + avg + ' from ' + soldPrices.length + ' sales');
    }

    return soldPrices;
  } catch (error) {
    return [];
  }
}

function evaluateDeal(listing, soldPrices) {
  if (soldPrices.length < 3) {
    return null;
  }
  
  const total = soldPrices.reduce(function(sum, item) { return sum + item.price; }, 0);
  const avgSoldPrice = total / soldPrices.length;
  const percentOfMarket = listing.price / avgSoldPrice;

  if (percentOfMarket <= 0.80) {
    const percentBelow = ((1 - percentOfMarket) * 100).toFixed(1);
    console.log('  >>> DEAL: $' + listing.price + ' vs $' + avgSoldPrice.toFixed(2) + ' avg (' + percentBelow + '% off)');
    
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
      timestamp: new Date().toISOString()
    };
  }
  
  return null;
}

app.post('/api/scan', async function(req, res) {
  if (!EBAY_CLIENT_ID) {
    return res.status(400).json({ success: false, error: 'eBay API not configured' });
  }

  console.log('\n========== CARDSNIPE SCAN ==========');
  console.log('LIQUID SETS ONLY: Prizm, Select, Optic, National Treasures');
  console.log('RAW CARDS ONLY: No PSA/BGS/SGC/CGC/graded/slab');
  console.log('NO JUNK: No lots, breaks, autos');
  console.log('PRICE: $50-$150');
  console.log('LISTINGS: 100 newest per player');
  console.log('THRESHOLD: ≤80% of market\n');
  
  const deals = [];
  const errors = [];

  try {
    const allPlayers = [];
    for (const sport in TRACKED_PLAYERS) {
      for (const category in TRACKED_PLAYERS[sport]) {
        allPlayers.push.apply(allPlayers, TRACKED_PLAYERS[sport][category]);
      }
    }

    console.log('Scanning ' + allPlayers.length + ' players...\n');

    for (let i = 0; i < allPlayers.length; i++) {
      const player = allPlayers[i];
      
      try {
        const listings = await searchEbayListings(player);
        
        if (listings.length > 0) {
          const soldPrices = await getSoldPrices(player);

          for (let j = 0; j < listings.length; j++) {
            const deal = evaluateDeal(listings[j], soldPrices);
            if (deal) {
              deals.push(deal);
            }
          }
        }

        await new Promise(function(resolve) { setTimeout(resolve, 1000); });
      } catch (error) {
        console.error('ERROR: ' + player + ' - ' + error.message);
        errors.push({ player: player, error: error.message });
      }
    }

    console.log('\n========== SCAN COMPLETE ==========');
    console.log('Deals found: ' + deals.length);
    console.log('Players scanned: ' + allPlayers.length + '\n');

    res.json({ 
      success: true, 
      deals: deals,
      scanned: allPlayers.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('FATAL: ' + error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/health', function(req, res) {
  res.json({ status: 'ok', configured: !!EBAY_CLIENT_ID, timestamp: new Date().toISOString() });
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
  console.log('eBay API configured: ' + !!EBAY_CLIENT_ID);
});
