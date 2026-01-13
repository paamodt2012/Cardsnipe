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

// MASSIVELY EXPANDED PLAYER LIST - 300+ PLAYERS
const TRACKED_PLAYERS = {
  basketball: {
    'Current Stars': [
      'Stephen Curry', 'LeBron James', 'Kevin Durant', 'Giannis Antetokounmpo', 'Nikola Jokic',
      'Luka Doncic', 'Joel Embiid', 'Jayson Tatum', 'Damian Lillard', 'Anthony Davis',
      'Devin Booker', 'Donovan Mitchell', 'Ja Morant', 'Trae Young', 'Zion Williamson',
      'Anthony Edwards', 'LaMelo Ball', 'Tyrese Haliburton', 'Paolo Banchero', 'Victor Wembanyama',
      'Shai Gilgeous-Alexander', 'De\'Aaron Fox', 'Jaylen Brown', 'DeMar DeRozan', 'Jimmy Butler',
      'Kawhi Leonard', 'Paul George', 'Bradley Beal', 'Kyrie Irving', 'James Harden',
      'Pascal Siakam', 'Julius Randle', 'Domantas Sabonis', 'Bam Adebayo', 'Rudy Gobert',
      'Kristaps Porzingis', 'Jaren Jackson Jr', 'Desmond Bane', 'Franz Wagner', 'Scottie Barnes',
      'Cade Cunningham', 'Jalen Green', 'Evan Mobley', 'Alperen Sengun', 'Jalen Williams',
      'Bennedict Mathurin', 'Keegan Murray', 'Jaden Ivey', 'Shaedon Sharpe', 'AJ Griffin'
    ],
    'All-Time Legends': [
      'Michael Jordan', 'Kobe Bryant', 'Magic Johnson', 'Larry Bird', 'Kareem Abdul-Jabbar',
      'Shaquille ONeal', 'Tim Duncan', 'Hakeem Olajuwon', 'Wilt Chamberlain', 'Bill Russell',
      'Julius Erving', 'Oscar Robertson', 'Jerry West', 'Elgin Baylor', 'Moses Malone',
      'Karl Malone', 'John Stockton', 'Charles Barkley', 'David Robinson', 'Patrick Ewing',
      'Allen Iverson', 'Dwyane Wade', 'Dirk Nowitzki', 'Kevin Garnett', 'Steve Nash',
      'Jason Kidd', 'Gary Payton', 'Scottie Pippen', 'Clyde Drexler', 'Isiah Thomas',
      'Reggie Miller', 'Chris Paul', 'Carmelo Anthony', 'Vince Carter', 'Tracy McGrady',
      'Ray Allen', 'Paul Pierce', 'Tony Parker', 'Manu Ginobili', 'Yao Ming',
      'Dikembe Mutombo', 'Alonzo Mourning', 'Grant Hill', 'Penny Hardaway', 'Chris Webber',
      'Rasheed Wallace', 'Ben Wallace', 'Chauncey Billups', 'Pau Gasol', 'Dwight Howard'
    ]
  },
  football: {
    'Current Stars': [
      'Patrick Mahomes', 'Josh Allen', 'Joe Burrow', 'Lamar Jackson', 'Jalen Hurts',
      'Justin Herbert', 'Tua Tagovailoa', 'Trevor Lawrence', 'Dak Prescott', 'CJ Stroud',
      'Brock Purdy', 'Jordan Love', 'Geno Smith', 'Jared Goff', 'Baker Mayfield',
      'Christian McCaffrey', 'Derrick Henry', 'Saquon Barkley', 'Josh Jacobs', 'Nick Chubb',
      'Austin Ekeler', 'Tony Pollard', 'Rhamondre Stevenson', 'Breece Hall', 'Kenneth Walker',
      'Bijan Robinson', 'Jahmyr Gibbs', 'Travis Etienne', 'Najee Harris', 'Dameon Pierce',
      'Tyreek Hill', 'Justin Jefferson', 'JaMarr Chase', 'Stefon Diggs', 'Davante Adams',
      'AJ Brown', 'CeeDee Lamb', 'Amon-Ra St Brown', 'DK Metcalf', 'Deebo Samuel',
      'Garrett Wilson', 'Chris Olave', 'Jaylen Waddle', 'DeVonta Smith', 'Tee Higgins',
      'Calvin Ridley', 'Tyler Lockett', 'Amari Cooper', 'Mike Evans', 'Keenan Allen',
      'Travis Kelce', 'Mark Andrews', 'George Kittle', 'TJ Hockenson', 'Dallas Goedert',
      'Evan Engram', 'Kyle Pitts', 'Darren Waller', 'David Njoku', 'Pat Freiermuth',
      'Nick Bosa', 'Micah Parsons', 'Myles Garrett', 'TJ Watt', 'Maxx Crosby',
      'Justin Jefferson', 'Sauce Gardner', 'Jalen Ramsey', 'Patrick Surtain', 'Jaire Alexander',
      'Roquan Smith', 'Fred Warner', 'Bobby Wagner', 'Demario Davis', 'CJ Mosley',
      'Justin Tucker', 'Harrison Butker', 'Evan McPherson', 'Tyler Bass', 'Daniel Carlson',
      'Dexter Lawrence', 'Chris Jones', 'Aaron Donald', 'Quinnen Williams', 'Jeffrey Simmons',
      'Trey Hendrickson', 'Josh Allen', 'Khalil Mack', 'Danielle Hunter', 'Brian Burns',
      'Christian Kirk', 'Marquise Brown', 'Gabe Davis', 'Elijah Moore', 'George Pickens',
      'Jaxon Smith-Njigba', 'Quentin Johnston', 'Jordan Addison', 'Zay Flowers', 'Rashee Rice'
    ],
    'All-Time Legends': [
      'Tom Brady', 'Peyton Manning', 'Joe Montana', 'Brett Favre', 'Dan Marino',
      'Aaron Rodgers', 'Drew Brees', 'John Elway', 'Troy Aikman', 'Steve Young',
      'Walter Payton', 'Emmitt Smith', 'Barry Sanders', 'Jim Brown', 'Eric Dickerson',
      'LaDainian Tomlinson', 'Adrian Peterson', 'Marshall Faulk', 'Curtis Martin', 'Jerome Bettis',
      'Jerry Rice', 'Randy Moss', 'Terrell Owens', 'Calvin Johnson', 'Larry Fitzgerald',
      'Marvin Harrison', 'Cris Carter', 'Michael Irvin', 'Steve Largent', 'Tim Brown',
      'Tony Gonzalez', 'Rob Gronkowski', 'Shannon Sharpe', 'Antonio Gates', 'Jason Witten'
    ]
  },
  baseball: {
    'Current Stars': [
      'Shohei Ohtani', 'Mike Trout', 'Mookie Betts', 'Aaron Judge', 'Ronald Acuna Jr',
      'Juan Soto', 'Fernando Tatum Jr', 'Julio Rodriguez', 'Bobby Witt Jr', 'Gunnar Henderson',
      'Corbin Carroll', 'Elly De La Cruz', 'Adley Rutschman', 'Riley Greene', 'Spencer Strider',
      'Paul Skenes', 'Jackson Holliday', 'Wyatt Langford', 'Jackson Merrill', 'James Wood',
      'Junior Caminero', 'Yoshinobu Yamamoto', 'Gerrit Cole', 'Zack Wheeler', 'Blake Snell',
      'Freddie Freeman', 'Jose Ramirez', 'Manny Machado', 'Rafael Devers', 'Austin Riley',
      'Vladimir Guerrero Jr', 'Pete Alonso', 'Kyle Tucker', 'Yordan Alvarez', 'Kyle Schwarber',
      'Marcus Semien', 'Corey Seager', 'Trea Turner', 'Francisco Lindor', 'Bo Bichette',
      'Bryce Harper', 'Matt Olson', 'Freddie Freeman', 'Paul Goldschmidt', 'Will Smith',
      'Salvador Perez', 'JT Realmuto', 'William Contreras', 'Cal Raleigh', 'Sean Murphy',
      'Sandy Alcantara', 'Corbin Burnes', 'Kevin Gausman', 'Logan Webb', 'Framber Valdez',
      'Shane Bieber', 'Dylan Cease', 'Joe Ryan', 'Hunter Greene', 'Grayson Rodriguez',
      'Edwin Diaz', 'Josh Hader', 'Emmanuel Clase', 'Devin Williams', 'Camilo Doval',
      'Wander Franco', 'CJ Abrams', 'Anthony Volpe', 'Ezequiel Tovar', 'Oneil Cruz',
      'Jarren Duran', 'Randy Arozarena', 'Josh Jung', 'Spencer Torkelson', 'Triston Casas',
      'Michael Harris II', 'Esteury Ruiz', 'Matt McLain', 'Royce Lewis', 'Noelvi Marte',
      'Jordan Walker', 'Colton Cowser', 'Evan Carter', 'Luis Matos', 'Diego Cartaya',
      'Jasson Dominguez', 'Ceddanne Rafaela', 'Jordan Lawlar', 'Marcelo Mayer', 'Jackson Chourio',
      'Cristian Hernandez', 'Harry Ford', 'Kevin Parada', 'Samuel Basallo', 'Dalton Rushing'
    ],
    'All-Time Legends': [
      'Babe Ruth', 'Willie Mays', 'Hank Aaron', 'Ted Williams', 'Mickey Mantle',
      'Barry Bonds', 'Ken Griffey Jr', 'Derek Jeter', 'Cal Ripken Jr', 'Tony Gwynn',
      'Greg Maddux', 'Pedro Martinez', 'Randy Johnson', 'Roger Clemens', 'Nolan Ryan',
      'Sandy Koufax', 'Bob Gibson', 'Tom Seaver', 'Cy Young', 'Walter Johnson',
      'Ichiro Suzuki', 'Albert Pujols', 'Miguel Cabrera', 'Chipper Jones', 'Frank Thomas',
      'Vladimir Guerrero', 'Gary Sheffield', 'Manny Ramirez', 'David Ortiz', 'Jim Thome',
      'Stan Musial', 'Ty Cobb', 'Lou Gehrig', 'Joe DiMaggio', 'Roberto Clemente'
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
      'keywords': `${playerName} card`,
      'itemFilter(0).name': 'ListingType',
      'itemFilter(0).value(0)': 'FixedPrice',
      'itemFilter(1).name': 'MinPrice',
      'itemFilter(1).value': '20',
      'itemFilter(2).name': 'MaxPrice',
      'itemFilter(2).value': '200',
      'paginationInput.entriesPerPage': '50'
    };

    const response = await axios.get(url, { params });
    const searchResult = response.data.findItemsAdvancedResponse?.[0]?.searchResult?.[0];
    
    const count = searchResult?.['@count'] || '0';
    console.log(`✓ ${playerName}: ${count} listings`);
    
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
      location: item.location?.[0] || 'Unknown',
      isRaw: !item.title[0].toLowerCase().includes('psa') && !item.title[0].toLowerCase().includes('bgs'),
      player: playerName
    }));
  } catch (error) {
    console.error(`❌ ${playerName}:`, error.message);
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
      'itemFilter(1).value': '20',
      'itemFilter(2).name': 'MaxPrice',
      'itemFilter(2).value': '300',
      'paginationInput.entriesPerPage': '10',
      'sortOrder': 'EndTimeSoonest'
    };

    const response = await axios.get(url, { params });
    const searchResult = response.data.findCompletedItemsResponse?.[0]?.searchResult?.[0];
    
    if (!searchResult || searchResult['@count'] === '0') {
      return [];
    }

    const items = searchResult.item || [];
    return items.slice(0, 5).map(item => ({
      price: parseFloat(item.sellingStatus[0].currentPrice[0].__value__),
      date: item.listingInfo[0].endTime[0]
    }));
  } catch (error) {
    return [];
  }
}

function evaluateDeal(listing, soldPrices) {
  if (soldPrices.length < 3) return null;
  
  const avgSoldPrice = soldPrices.reduce((sum, item) => sum + item.price, 0) / soldPrices.length;
  const percentOfMarket = listing.price / avgSoldPrice;

  if (percentOfMarket <= 0.80 && listing.price >= 20 && listing.price <= 200) {
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

  console.log('\n🚀 ========== STARTING MEGA SCAN ==========');
  const deals = [];
  const errors = [];

  try {
    const allPlayers = Object.values(TRACKED_PLAYERS)
      .flatMap(sport => Object.values(sport))
      .flat();

    console.log(`📋 Scanning ${allPlayers.length} total players...\n`);

    for (let i = 0; i < allPlayers.length; i++) {
      const player = allPlayers[i];
      
      try {
        const listings = await searchEbayListings(player);
        
        if (listings.length > 0) {
          const soldPrices = await getSoldPrices(player);

          for (const listing of listings) {
            const deal = evaluateDeal(listing, soldPrices);
            if (deal) {
              deals.push(deal);
              console.log(`   🎉 DEAL: ${player} - ${deal.title.substring(0, 40)}... at ${deal.percentUnder}% off`);
            }
          }
        }

        // Small delay to respect API limits
        if (i % 10 === 0 && i > 0) {
          console.log(`   ⏸️  Processed ${i}/${allPlayers.length} players, ${deals.length} deals so far...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
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
