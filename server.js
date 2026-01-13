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
      'keywords': `${playerName} card`,
      'itemFilter(0).name': 'ListingType',
      'itemFilter(0).value(0)': 'FixedPrice',
      'itemFilter(1).name': 'MinPrice',
      'itemFilter(1).value': '30',
      'itemFilter(2).name': 'MaxPrice',
      'itemFilter(2).value': '150',
      'paginationInput.entriesPerPage': '20'
    };

    console.log(`🔍 Searching eBay for: ${playerName}`);
    const response = await axios.get(url, { params });
    const searchResult = response.data.findItemsAdvancedResponse?.[0]?.searchResult?.[0];
    
    const count = searchResult?.['@count'] || '0';
    console.log(`   ✓ Found ${count} active listings`);
    
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
    console.error(`   ❌ Error searching for ${playerName}:`, error.message);
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
      'keywords': `${playerName} card`,
      'itemFilter(0).name': 'SoldItemsOnly',
      'itemFilter(0).value': 'true',
      'itemFilter(1).name': 'MinPrice',
      'itemFilter(1).value': '30',
      'itemFilter(2).name': 'MaxPrice',
      'itemFilter(2).value': '200',
      'paginationInput.entriesPerPage': '10',
      'sortOrder': 'EndTimeSoonest'
    };

    const response = await axios.get(url, { params });
    const searchResult = response.data.findCompletedItemsResponse?.[0]?.searchResult?.[0];
    
    const count = searchResult?.['@count'] || '0';
    console.log(`   💰 Found ${count} recently sold items`);
    
    if (!searchResult || searchResult['@count'] === '0') {
      return [];
    }

    const items = searchResult.item || [];
    const soldPrices = items.slice(0, 3).map(item => ({
      price: parseFloat(item.sellingStatus[0].currentPrice[0].__value__),
      date: item.listingInfo[0].endTime[0]
    }));

    if (soldPrices.length > 0) {
      const avg = (soldPrices.reduce((sum, item) => sum + item.price, 0) / soldPrices.length).toFixed(2);
      console.log(`   📊 Avg of last 3 sold: $${avg}`);
    }

    return soldPrices;
  } catch (error) {
    console.error(`   ❌ Error getting sold prices for ${playerName}:`, error.message);
    return [];
  }
}

function evaluateDeal(listing, soldPrices) {
  if (soldPrices.length < 3) {
    console.log(`   ⚠️  Skipping ${listing.title.substring(0, 40)}... - not enough sold data`);
    return null;
  }
  
  const avgSoldPrice = soldPrices.reduce((sum, item) => sum + item.price, 0) / soldPrices.length;
  const percentOfMarket = listing.price / avgSoldPrice;

  console.log(`   📝 ${listing.title.substring(0, 40)}... - $${listing.price} (${(percentOfMarket * 100).toFixed(0)}% of avg $${avgSoldPrice.toFixed(2)})`);

  if (percentOfMarket <= 0.80) {
    console.log(`   🎉 DEAL FOUND! ${((1 - percentOfMarket) * 100).toFixed(0)}% below market`);
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

  console.log('\n🚀 ========== STARTING SCAN ==========');
  const deals = [];
  const errors = [];

  try {
    const allPlayers = Object.values(TRACKED_PLAYERS)
      .flatMap(sport => Object.values(sport))
      .flat()
      .slice(0, 5);

    console.log(`📋 Scanning ${allPlayers.length} players: ${allPlayers.join(', ')}\n`);

    for (const player of allPlayers) {
      try {
        const listings = await searchEbayListings(player);
        
        if (listings.length === 0) {
          console.log(`   ⚠️  No listings found\n`);
          continue;
        }

        const soldPrices = await getSoldPrices(player);

        for (const listing of listings) {
          const deal = evaluateDeal(listing, soldPrices);
          if (deal) {
            deals.push(deal);
          }
        }

        console.log(''); // blank line between players
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Error with ${player}:`, error.message);
        errors.push({ player, error: error.message });
      }
    }

    console.log(`\n✅ ========== SCAN COMPLETE ==========`);
    console.log(`   Found ${deals.length} total deals`);
    console.log(`   Scanned ${allPlayers.length} players`);
    console.log(`   Errors: ${errors.length}\n`);

    res.json({ 
      success: true, 
      deals,
      scanned: allPlayers.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('❌ Scan error:', error);
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
