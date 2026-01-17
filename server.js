const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;

app.post('/api/scan', async function(req, res) {
  console.log('\n========================================');
  console.log('SIMPLE SINGLE API TEST');
  console.log('========================================\n');
  
  if (!EBAY_CLIENT_ID) {
    console.log('ERROR: No eBay Client ID found!');
    return res.status(400).json({ success: false, error: 'No API key' });
  }
  
  console.log('eBay Client ID exists: YES\n');
  
  try {
    const url = 'https://svcs.ebay.com/services/search/FindingService/v1';
    
    console.log('Making single test call to eBay...');
    
    const params = {
      'OPERATION-NAME': 'findItemsByKeywords',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': EBAY_CLIENT_ID,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'keywords': 'basketball card',
      'paginationInput.entriesPerPage': '5'
    };
    
    const response = await axios.get(url, { params: params });
    
    console.log('Response received!');
    console.log('Status: ' + response.status);
    
    const data = response.data.findItemsByKeywordsResponse;
    
    if (!data || !data[0]) {
      console.log('ERROR: Invalid response structure');
      return res.json({ 
        success: false, 
        error: 'Invalid eBay response', 
        raw: response.data 
      });
    }
    
    const result = data[0].searchResult[0];
    const count = result['@count'] || '0';
    const ack = data[0].ack[0];
    
    console.log('Acknowledgement: ' + ack);
    console.log('Results found: ' + count);
    
    if (ack === 'Success' && count !== '0') {
      console.log('\n✓ eBay API is working correctly!');
      console.log('\nFirst 3 results:');
      
      if (result.item) {
        for (let i = 0; i < Math.min(3, result.item.length); i++) {
          const item = result.item[i];
          console.log('  ' + (i + 1) + '. $' + item.sellingStatus[0].currentPrice[0].__value__ + ' - ' + item.title[0].substring(0, 50));
        }
      }
      
      res.json({
        success: true,
        message: 'eBay API is working!',
        itemsFound: count,
        acknowledgement: ack
      });
    } else {
      console.log('\n✗ eBay returned success but no results');
      res.json({
        success: false,
        error: 'No results returned',
        acknowledgement: ack,
        count: count
      });
    }
    
  } catch (error) {
    console.error('\n✗ API CALL FAILED');
    console.error('Error: ' + error.message);
    
    if (error.response) {
      console.error('Status Code: ' + error.response.status);
      console.error('Response Data: ' + JSON.stringify(error.response.data, null, 2));
      
      res.status(error.response.status).json({ 
        success: false, 
        error: error.message,
        statusCode: error.response.status,
        ebayError: error.response.data
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
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
  console.log('CardSnipe server running on port ' + PORT);
});
