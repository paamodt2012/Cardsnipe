const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;

// Add delay function to prevent rate limiting
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

app.post('/api/scan', async function(req, res) {
  console.log('\n========================================');
  console.log('ULTIMATE DEBUG SCAN');
  console.log('========================================\n');
  
  if (!EBAY_CLIENT_ID) {
    console.log('ERROR: No eBay Client ID found!');
    return res.status(400).json({ success: false, error: 'No API key' });
  }
  
  console.log('eBay Client ID: ' + EBAY_CLIENT_ID.substring(0, 20) + '...\n');
  
  const testPlayer = 'Victor Wembanyama';
  console.log('Testing with: ' + testPlayer + '\n');
  
  try {
    const url = 'https://svcs.ebay.com/services/search/FindingService/v1';
    
    console.log('=== TEST 1: Absolute Minimum Filters ===');
    const params1 = {
      'OPERATION-NAME': 'findItemsByKeywords',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': EBAY_CLIENT_ID,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'keywords': 'Wembanyama',
      'paginationInput.entriesPerPage': '20'
    };
    
    console.log('Query: "Wembanyama" (bare minimum)');
    const response1 = await axios.get(url, { params: params1 });
    
    const data1 = response1.data.findItemsByKeywordsResponse;
    if (!data1 || !data1[0]) {
      console.log('FATAL: No response object from eBay');
      return res.json({ success: false, error: 'Invalid eBay response', raw: response1.data });
    }
    
    const result1 = data1[0].searchResult[0];
    const count1 = result1['@count'] || '0';
    
    console.log('Results: ' + count1 + ' items');
    
    if (count1 === '0') {
      console.log('ERROR: eBay returned ZERO results for bare "Wembanyama" search');
      console.log('This means either:');
      console.log('  1. eBay API is not working');
      console.log('  2. API key is invalid');
      console.log('  3. Geographic restriction');
      return res.json({ success: false, error: 'Zero results on basic search', count: count1 });
    }
    
    console.log('\nFirst 5 items:');
    if (result1.item) {
      for (let i = 0; i < Math.min(5, result1.item.length); i++) {
        const item = result1.item[i];
        console.log('  ' + (i + 1) + '. [$' + item.sellingStatus[0].currentPrice[0].__value__ + '] ' + item.title[0]);
      }
    }
    
    // WAIT 3 seconds before next request
    console.log('\n[Waiting 3 seconds to avoid rate limit...]');
    await delay(3000);
    
    console.log('\n=== TEST 2: Add Price Filter ($40-$150) ===');
    const params2 = {
      'OPERATION-NAME': 'findItemsByKeywords',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': EBAY_CLIENT_ID,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'keywords': 'Wembanyama',
      'itemFilter(0).name': 'MinPrice',
      'itemFilter(0).value': '40',
      'itemFilter(1).name': 'MaxPrice',
      'itemFilter(1).value': '150',
      'paginationInput.entriesPerPage': '20'
    };
    
    const response2 = await axios.get(url, { params: params2 });
    const result2 = response2.data.findItemsByKeywordsResponse[0].searchResult[0];
    const count2 = result2['@count'] || '0';
    
    console.log('Results in $40-$150: ' + count2);
    
    if (result2.item) {
      console.log('First 3:');
      for (let i = 0; i < Math.min(3, result2.item.length); i++) {
        const item = result2.item[i];
        console.log('  [$' + item.sellingStatus[0].currentPrice[0].__value__ + '] ' + item.title[0]);
      }
    }
    
    // WAIT 3 seconds
    console.log('\n[Waiting 3 seconds...]');
    await delay(3000);
    
    console.log('\n=== TEST 3: Add "Prizm" Requirement ===');
    const params3 = {
      'OPERATION-NAME': 'findItemsByKeywords',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': EBAY_CLIENT_ID,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'keywords': 'Wembanyama Prizm',
      'itemFilter(0).name': 'MinPrice',
      'itemFilter(0).value': '40',
      'itemFilter(1).name': 'MaxPrice',
      'itemFilter(1).value': '150',
      'paginationInput.entriesPerPage': '20'
    };
    
    const response3 = await axios.get(url, { params: params3 });
    const result3 = response3.data.findItemsByKeywordsResponse[0].searchResult[0];
    const count3 = result3['@count'] || '0';
    
    console.log('Results for "Wembanyama Prizm" in $40-$150: ' + count3);
    
    if (result3.item) {
      console.log('All items:');
      for (let i = 0; i < result3.item.length; i++) {
        const item = result3.item[i];
        const title = item.title[0];
        const price = item.sellingStatus[0].currentPrice[0].__value__;
        const hasGraded = title.toLowerCase().indexOf('psa') !== -1 || 
                         title.toLowerCase().indexOf('bgs') !== -1;
        
        console.log('  [$' + price + '] ' + (hasGraded ? '[GRADED] ' : '[RAW] ') + title.substring(0, 70));
      }
    }
    
    // WAIT 3 seconds
    console.log('\n[Waiting 3 seconds...]');
    await delay(3000);
    
    console.log('\n=== TEST 4: Exclude Graded ===');
    const params4 = {
      'OPERATION-NAME': 'findItemsByKeywords',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': EBAY_CLIENT_ID,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'keywords': 'Wembanyama Prizm -psa -bgs',
      'itemFilter(0).name': 'MinPrice',
      'itemFilter(0).value': '40',
      'itemFilter(1).name': 'MaxPrice',
      'itemFilter(1).value': '150',
      'paginationInput.entriesPerPage': '20'
    };
    
    const response4 = await axios.get(url, { params: params4 });
    const result4 = response4.data.findItemsByKeywordsResponse[0].searchResult[0];
    const count4 = result4['@count'] || '0';
    
    console.log('Results excluding graded: ' + count4);
    
    let rawCards = [];
    if (result4.item) {
      console.log('Raw cards:');
      for (let i = 0; i < result4.item.length; i++) {
        const item = result4.item[i];
        const title = item.title[0];
        const price = parseFloat(item.sellingStatus[0].currentPrice[0].__value__);
        
        console.log('  [$' + price + '] ' + title);
        rawCards.push({ title: title, price: price, url: item.viewItemURL[0] });
      }
    }
    
    // WAIT 3 seconds before checking sold comps
    console.log('\n[Waiting 3 seconds...]');
    await delay(3000);
    
    console.log('\n=== TEST 5: Check Sold Comps ===');
    const params5 = {
      'OPERATION-NAME': 'findCompletedItems',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': EBAY_CLIENT_ID,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'keywords': 'Wembanyama Prizm -psa -bgs',
      'itemFilter(0).name': 'SoldItemsOnly',
      'itemFilter(0).value': 'true',
      'paginationInput.entriesPerPage': '10'
    };
    
    const response5 = await axios.get(url, { params: params5 });
    const result5 = response5.data.findCompletedItemsResponse[0].searchResult[0];
    const count5 = result5['@count'] || '0';
    
    console.log('Sold items found: ' + count5);
    
    if (result5.item) {
      const soldPrices = [];
      console.log('Recent sold:');
      for (let i = 0; i < Math.min(5, result5.item.length); i++) {
        const item = result5.item[i];
        const price = parseFloat(item.sellingStatus[0].currentPrice[0].__value__);
        soldPrices.push(price);
        console.log('  Sold for: $' + price);
      }
      
      if (soldPrices.length > 0) {
        const avg = (soldPrices.reduce(function(a, b) { return a + b; }) / soldPrices.length).toFixed(2);
        console.log('\nAverage sold: $' + avg);
        
        console.log('\n=== DEAL ANALYSIS ===');
        for (let i = 0; i < rawCards.length; i++) {
          const card = rawCards[i];
          const percentOfMarket = (card.price / avg * 100).toFixed(0);
          const isDeal = card.price / avg <= 0.80;
          
          console.log(card.title.substring(0, 60));
          console.log('  Price: $' + card.price + ' vs Avg: $' + avg + ' (' + percentOfMarket + '% of market)');
          console.log('  ' + (isDeal ? '>>> DEAL! <<<' : 'Not a deal (needs ≤80%)'));
        }
      }
    }
    
    console.log('\n========================================');
    console.log('DEBUG COMPLETE');
    console.log('========================================\n');
    
    res.json({
      success: true,
      tests: {
        bareSearch: count1,
        withPriceFilter: count2,
        withPrizm: count3,
        excludingGraded: count4,
        soldComps: count5
      },
      rawCards: rawCards
    });
    
  } catch (error) {
    console.error('\nFATAL ERROR: ' + error.message);
    if (error.response) {
      console.error('Status: ' + error.response.status);
      console.error('Data: ' + JSON.stringify(error.response.data).substring(0, 500));
    }
    
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/health', function(req, res) {
  res.json({ status: 'ok', configured: !!EBAY_CLIENT_ID });
});

app.get('/api/players', function(req, res) {
  res.json({ basketball: { test: ['Victor Wembanyama'] } });
});

app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('CardSnipe DEBUG server - port ' + PORT);
});
