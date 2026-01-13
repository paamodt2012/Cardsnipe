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
    'Point Guard': ['Stephen Curry', 'Luka Doncic', 'Damian Lillard', 'Magic Johnson', 'John Stockton', 'Oscar Robertson'],
    'Shooting Guard': ['Devin Booker', 'Donovan Mitchell', 'Anthony Edwards', 'Michael Jordan', 'Kobe Bryant', 'Dwyane Wade'],
    'Small Forward': ['LeBron James', 'Kevin Durant', 'Jayson Tatum', 'Larry Bird', 'Julius Erving', 'Scottie Pippen'],
    'Power Forward': ['Giannis Antetokounmpo', 'Nikola Jokic', 'Anthony Davis', 'Tim Duncan', 'Karl Malone', 'Charles Barkley'],
    'Center': ['Joel Embiid', 'Victor Wembanyama', 'Bam Adebayo', 'Kareem Abdul-Jabbar', 'Shaquille ONeal', 'Hakeem Olajuwon']
  },
  football: {
    'Quarterback': ['Patrick Mahomes', 'Josh Allen', 'Joe Burrow'],
    'Running Back': ['Christian McCaffrey', 'Saquon Barkley', 'Derrick Henry'],
    'Wide Receiver': ['Tyreek Hill', 'Justin Jefferson', 'JaMarr Chase'],
    'Tight End': ['Travis Kelce', 'Mark Andrews', 'George Kittle']
  },
  baseball: {
    'Rising Stars': ['Bobby Witt Jr.', 'Gunnar Henderson', 'Corbin Carroll', 'Elly De La Cruz', 'Jackson Holliday', 'Wyatt Langford', 'Jackson Merrill', 'Paul Skenes', 'James Wood', 'Junior Caminero']
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
      'keywords': `${playerName} sports card raw`,
      'itemFilter(0).name': 'ListingType',
      'itemFilter(0).value(0)': 'FixedPrice',
      'itemFilter(1).name': 'MinPrice',
      'itemFilter(1).value': '50',
      'itemFilter(2).name': 'MaxPrice',
      'itemFilter(2).value': '100',
      'itemFilter(3).name': 'LocatedIn',
      'itemFilter(3).value': 'US',
      'paginationInput.entriesPerPage': '10'
    };

    const response = await axios.get(url, { params });
    const searchResult = response.data.findItemsAdvancedResponse?.[0]?.searchResult?.[0];
    
    if (!searchResult || searchResult['@count'] === '0') {
      return [];
    }

    const items = searchResult.item || [];
    return items.map(item => ({
      id: item.itemId[0],
      title: item.title[0],
      price: parseFloat(item.sellingStatus[0].currentPrice[0].__value__),
      url: item.viewItemURL[0],
      listingType: 'BuyItNow',
      location: 'US',
      isRaw: true,
      player: playerName
    }));
  } catch (error) {
    console.error(`Error searching for ${playerName}:`, error.message);
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
      'keywords': `${playerName} sports card raw`,
      'itemFilter(0).name': 'SoldItemsOnly',
      'itemFilter(0).value': 'true',
      'itemFilter(1).name': 'MinPrice',
      'itemFilter(1).value': '50',
      'itemFilter(2).name': 'MaxPrice',
      'itemFilter(2).value': '150',
      'paginationInput.entriesPerPage': '3',
      'sortOrder': 'EndTimeSoonest'
    };

    const response = await axios.get(url, { params });
    const searchResult = response.data.findCompletedItemsResponse?.[0]?.searchResult?.[0];
    
    if (!searchResult || searchResult['@count'] === '0') {
      return [];
    }

    const items = searchResult.item || [];
    return items.map(item => ({
      price: parseFloat(item.sellingStatus[0].currentPrice[0].__value__),
      date: item.listingInfo[0].endTime[0]
    }));
  } catch (error) {
    console.error(`Error getting sold prices for ${playerName}:`, error.message);
    return [];
  }
}

function evaluateDeal(listing, soldPrices) {
  if (soldPrices.length < 3) return null;
  
  const avgSoldPrice = soldPrices.reduce((sum, item) => sum + item.price, 0) / soldPrices.length;
  const percentOfMarket = listing.price / avgSoldPrice;

  if (percentOfMarket <= 0.80) {
    return {
      ...listing,
      avgSoldPrice: avgSoldPrice.toFixed(2),
      percentUnder: ((1 - percentOfMarket) * 100).toFixed(1),
      timestamp: new Date().toISOString()
    };
  }
  
  return null;
}

app.post('/api/scan', async (req, res) => {
  if (!EBAY_CLIENT_ID) {
    return res.status(400).json({ success: false, error: 'eBay API credentials not configured' });
  }

  const deals = [];
  const errors = [];

  try {
    const allPlayers = Object.values(TRACKED_PLAYERS)
      .flatMap(sport => Object.values(sport))
      .flat()
      .slice(0, 10);

    for (const player of allPlayers) {
      try {
        console.log(`Scanning ${player}...`);
        
        const listings = await searchEbayListings(player);
        const soldPrices = await getSoldPrices(player);

        for (const listing of listings) {
          const deal = evaluateDeal(listing, soldPrices);
          if (deal) {
            deals.push(deal);
          }
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        errors.push({ player, error: error.message });
      }
    }

    res.json({ 
      success: true, 
      deals,
      scanned: allPlayers.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    configured: !!EBAY_CLIENT_ID,
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
  console.log(`eBay API configured: ${!!EBAY_CLIENT_ID}`);
});
