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
      'Jayson Tatum'
    ]
  },
  football: {
    'NFL Stars': [
      'Patrick Mahomes',
      'Josh Allen',
      'Jalen Hurts',
      'CJ Stroud',
      'Jayden Daniels'
    ]
  }
};

async function searchEbayListings(playerName) {
  try {
    const url = 'https://svcs.ebay.com/services/search/FindingService/v1';
    const params = {
      'OPERATION-NAME': 'findItemsAdvanced',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': EBAY_CLIENT_ID,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'REST-PAYLOAD': '',
      'keywords': playerName + ' card',
      'itemFilter(0).name': 'ListingType',
      'itemFilter(0).value(0)': 'FixedPrice',
      'itemFilter(1).name': 'MinPrice',
      'itemFilter(1).value': '50',
      'itemFilter(2).name': 'MaxPrice',
      'itemFilter(2).value': '150',
      'paginationInput.entriesPerPage': '35',
      'sortOrder': 'StartTimeNewest'
    };

    console.log('\n========================================');
    console.log('SEARCHING: ' + playerName);
    console.log('========================================');
    
    const response = await axios.get(url, { params });
    const searchResult = response.data.findItemsAdvancedResponse[0].searchResult[0];
    
    const count = searchResult['@count'] || '0';
    console.log('eBay returned: ' + count + ' listings');
    
    if (!searchResult || searchResult['@count'] === '0') {
      console.log('NO LISTINGS FOUND - API returned zero results');
      return [];
    }

    const items = searchResult.item || [];
    console.log('Processing ' + items.length + ' items...\n');
    
    const results = items.map(function(item) {
      const title = item.title[0];
      const price = parseFloat(item.sellingStatus[0].currentPrice[0].__value__);
      
      console.log('  [' + price + '] ' + title.substring(0, 60));
      
      return {
        id: item.itemId[0],
        title: title,
        price: price,
        url: item.viewItemURL[0],
        listingType: 'BuyItNow',
        location: item.location ? item.location[0] : 'Unknown',
        isRaw: title.toLowerCase().indexOf('psa') === -1 && title.toLowerCase().indexOf('bgs') === -1,
        player: playerName,
        listingDate: item.listingInfo[0].startTime[0]
      };
    });
    
    console.log('\nTotal processed: ' + results.length + ' listings');
    return results;
    
  } catch (error) {
    console.error('ERROR searching for ' + playerName + ': ' + error.message);
    if (error.response) {
      console.error('eBay API response:', JSON.stringify(error.response.data).substring(0, 500));
    }
    return [];
  }
}

async function getSoldPrices(playerName) {
  try {
    const url = 'https://svcs.ebay.com/services/search/FindingService/v1';
    const params = {
      'OPERATION-NAME': 'findCompletedItems',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': EBAY_CLIENT_ID,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'REST-PAYLOAD': '',
      'keywords': playerName + ' card',
      'itemFilter(0).name': 'SoldItemsOnly',
      'itemFilter(0).value': 'true',
      'itemFilter(1).name': 'MinPrice',
      'itemFilter(1).value': '50',
      'itemFilter(2).name': 'MaxPrice',
      'itemFilter(2).value': '200',
      'paginationInput.entriesPerPage': '10',
      'sortOrder': 'EndTimeSoonest'
    };

    const response = await axios.get(url, { params });
    const searchResult = response.data.findCompletedItemsResponse[0].searchResult[0];
    
    const count = searchResult['@count'] || '0';
    console.log('\nSOLD ITEMS: ' + count + ' found');
    
    if (!searchResult || searchResult['@count'] === '0') {
      console.log('WARNING: No sold items found for comparison!');
      return [];
    }

    const items = searchResult.item || [];
    const soldPrices = items.slice(0, 5).map(function(item) {
      const price = parseFloat(item.sellingStatus[0].currentPrice[0].__value__);
      console.log('  Sold for: $' + price);
      return {
        price: price,
        date: item.listingInfo[0].endTime[0]
      };
    });

    if (soldPrices.length > 0) {
      const total = soldPrices.reduce(function(sum, item) {
        return sum + item.price;
      }, 0);
      const avg = (total / soldPrices.length).toFixed(2);
      console.log('AVERAGE SOLD PRICE: $' + avg);
    }

    return soldPrices;
  } catch (error) {
    console.error('ERROR getting sold prices: ' + error.message);
    return [];
  }
}

function evaluateDeal(listing, soldPrices) {
  if (soldPrices.length < 3) {
    console.log('  SKIP: Not enough sold data (need 3, have ' + soldPrices.length + ')');
    return null;
  }
  
  const total = soldPrices.reduce(function(sum, item) {
    return sum + item.price;
  }, 0);
  const avgSoldPrice = total / soldPrices.length;
  const percentOfMarket = listing.price / avgSoldPrice;
  const percentBelow = ((1 - percentOfMarket) * 100).toFixed(1);

  console.log('  EVALUATE: $' + listing.price + ' vs avg $' + avgSoldPrice.toFixed(2) + ' = ' + (percentOfMarket * 100).toFixed(0) + '% of market');

  if (percentOfMarket <= 0.80 && listing.price >= 50 && listing.price <= 150) {
    console.log('  ✓✓✓ DEAL FOUND! ' + percentBelow + '% below market ✓✓✓');
    
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
  } else {
    console.log('  SKIP: Price too high (' + (percentOfMarket * 100).toFixed(0) + '% of market, need ≤80%)');
  }
  
  return null;
}

app.post('/api/scan', async function(req, res) {
  if (!EBAY_CLIENT_ID) {
    return res.status(400).json({ success: false, error: 'eBay API credentials not configured' });
  }

  console.log('\n\n');
  console.log('################################################');
  console.log('########    STARTING DEBUG SCAN    #############');
  console.log('################################################');
  console.log('Price range: $50-$150');
  console.log('Deal threshold: ≤80% of market');
  console.log('################################################\n');
  
  const deals = [];
  const errors = [];

  try {
    const allPlayers = [];
    for (const sport in TRACKED_PLAYERS) {
      for (const category in TRACKED_PLAYERS[sport]) {
        allPlayers.push.apply(allPlayers, TRACKED_PLAYERS[sport][category]);
      }
    }

    console.log('Scanning ' + allPlayers.length + ' players (DEBUG MODE - only 10 for testing)\n');

    for (let i = 0; i < allPlayers.length; i++) {
      const player = allPlayers[i];
      
      try {
        const listings = await searchEbayListings(player);
        
        if (listings.length > 0) {
          const soldPrices = await getSoldPrices(player);

          console.log('\nEVALUATING DEALS:');
          for (let j = 0; j < listings.length; j++) {
            const deal = evaluateDeal(listings[j], soldPrices);
            if (deal) {
              deals.push(deal);
            }
          }
        } else {
          console.log('>>> SKIPPING: No listings to evaluate');
        }

        await new Promise(function(resolve) {
          setTimeout(resolve, 1000);
        });
      } catch (error) {
        console.error('ERROR with ' + player + ': ' + error.message);
        errors.push({ player: player, error: error.message });
      }
    }

    console.log('\n\n################################################');
    console.log('########    SCAN COMPLETE    ###################');
    console.log('################################################');
    console.log('TOTAL DEALS FOUND: ' + deals.length);
    console.log('Players scanned: ' + allPlayers.length);
    console.log('Errors: ' + errors.length);
    console.log('################################################\n\n');

    res.json({ 
      success: true, 
      deals: deals,
      scanned: allPlayers.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('FATAL SCAN ERROR: ' + error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/health', function(req, res) {
  res.json({ 
    status: 'ok', 
    configured: !!EBAY_CLIENT_ID,
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
  console.log('CardSnipe DEBUG server running on port ' + PORT);
  console.log('eBay API configured: ' + !!EBAY_CLIENT_ID);
});
