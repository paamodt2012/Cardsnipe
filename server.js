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

    console.log('Searching for: ' + playerName);
    const response = await axios.get(url, { params });
    const searchResult = response.data.findItemsAdvancedResponse[0].searchResult[0];
    
    const count = searchResult['@count'] || '0';
    console.log('  Found ' + count + ' listings');
    
    if (!searchResult || searchResult['@count'] === '0') {
      return [];
    }

    const items = searchResult.item || [];
    return items.map(function(item) {
      return {
        id: item.itemId[0],
        title: item.title[0],
        price: parseFloat(item.sellingStatus[0].currentPrice[0].__value__),
        url: item.viewItemURL[0],
        listingType: 'BuyItNow',
        location: item.location ? item.location[0] : 'Unknown',
        isRaw: item.title[0].toLowerCase().indexOf('psa') === -1 && item.title[0].toLowerCase().indexOf('bgs') === -1,
        player: playerName,
        listingDate: item.listingInfo[0].startTime[0]
      };
    });
  } catch (error) {
    console.error('Error searching for ' + playerName + ': ' + error.message);
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
    console.log('  Found ' + count + ' sold items');
    
    if (!searchResult || searchResult['@count'] === '0') {
      return [];
    }

    const items = searchResult.item || [];
    const soldPrices = items.slice(0, 5).map(function(item) {
      return {
        price: parseFloat(item.sellingStatus[0].currentPrice[0].__value__),
        date: item.listingInfo[0].endTime[0]
      };
    });

    if (soldPrices.length > 0) {
      const total = soldPrices.reduce(function(sum, item) {
        return sum + item.price;
      }, 0);
      const avg = (total / soldPrices.length).toFixed(2);
      console.log('  Avg of last ' + soldPrices.length + ' sold: $' + avg);
    }

    return soldPrices;
  } catch (error) {
    console.error('  Error getting sold prices: ' + error.message);
    return [];
  }
}

function evaluateDeal(listing, soldPrices) {
  if (soldPrices.length < 3) {
    return null;
  }
  
  const total = soldPrices.reduce(function(sum, item) {
    return sum + item.price;
  }, 0);
  const avgSoldPrice = total / soldPrices.length;
  const percentOfMarket = listing.price / avgSoldPrice;

  if (percentOfMarket <= 0.80 && listing.price >= 50 && listing.price <= 150) {
    const discount = ((1 - percentOfMarket) * 100).toFixed(0);
    const shortTitle = listing.title.substring(0, 50);
    console.log('  DEAL: ' + shortTitle + '... - $' + listing.price + ' (' + discount + '% off)');
    
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
      percentUnder: ((1 - percentOfMarket) * 100).toFixed(1),
      timestamp: new Date().toISOString()
    };
  }
  
  return null;
}

app.post('/api/scan', async function(req, res) {
  if (!EBAY_CLIENT_ID) {
    return res.status(400).json({ success: false, error: 'eBay API credentials not configured' });
  }

  console.log('\n========== STARTING SCAN ==========');
  console.log('Searching 35 NEWEST listings per player');
  console.log('Price range: $50-$150');
  console.log('Deal threshold: 80% of market\n');
  
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

        console.log('');
        await new Promise(function(resolve) {
          setTimeout(resolve, 800);
        });
      } catch (error) {
        console.error('Error with ' + player + ': ' + error.message);
        errors.push({ player: player, error: error.message });
      }
    }

    console.log('\n========== SCAN COMPLETE ==========');
    console.log('Found ' + deals.length + ' total deals');
    console.log('Scanned ' + allPlayers.length + ' players');
    console.log('Errors: ' + errors.length + '\n');

    res.json({ 
      success: true, 
      deals: deals,
      scanned: allPlayers.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Scan error: ' + error.message);
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
  console.log('CardSnipe server running on port ' + PORT);
  console.log('eBay API configured: ' + !!EBAY_CLIENT_ID);
});
