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
  console.log('CHECKING RATE LIMIT STATUS');
  console.log('========================================\n');
  
  if (!EBAY_CLIENT_ID) {
    console.log('ERROR: No eBay Client ID found!');
    return res.status(400).json({ success: false, error: 'No API key' });
  }
  
  try {
    // First, check rate limit status
    const rateLimitUrl = 'https://api.ebay.com/developer/analytics/v1_beta/user_rate_limit/';
    
    console.log('Checking your rate limit status...\n');
    
    try {
      const rateLimitResponse = await axios.get(rateLimitUrl, {
        params: {
          api_name: 'FindingService'
        },
        headers: {
          'Authorization': 'Bearer ' + EBAY_CLIENT_ID
        }
      });
      
      console.log('Rate limit data:');
      console.log(JSON.stringify(rateLimitResponse.data, null, 2));
    } catch (rateLimitError) {
      console.log('Could not check rate limit (might need OAuth token)');
      console.log('Error: ' + rateLimitError.message);
    }
    
    // Now try a simple Finding API call
    console.log('\n========================================');
    console.log('TESTING FINDING API');
    console.log('========================================\n');
    
    const url = 'https://svcs.ebay.com/services/search/FindingService/v1';
    
    const params = {
      'OPERATION-NAME': 'findItemsByKeywords',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': EBAY_CLIENT_ID,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'keywords': 'basketball card',
      'paginationInput.entriesPerPage': '3'
    };
    
    console.log('Making test API call...');
    console.log('Keywords: basketball card');
    console.log('Client ID: ' + EBAY_CLIENT_ID.substring(0, 15) + '...\n');
    
    const response = await axios.get(url, { params: params });
    
    console.log('Response Status: ' + response.status);
    
    const data = response.data.findItemsByKeywordsResponse;
    
    if (!data || !data[0]) {
      console.log('ERROR: No response data');
      return res.json({ 
        success: false, 
        error: 'No response data',
        fullResponse: response.data 
      });
    }
    
    const ack = data[0].ack[0];
    console.log('Acknowledgement: ' + ack);
    
    // Check for errors in response
    if (data[0].errorMessage) {
      console.log('\n!!! eBay RETURNED AN ERROR !!!');
      console.log('Error Details:');
      console.log(JSON.stringify(data[0].errorMessage, null, 2));
      
      return res.json({
        success: false,
        acknowledgement: ack,
        ebayError: data[0].errorMessage
      });
    }
    
    const result = data[0].searchResult[0];
    const count = result['@count'] || '0';
    
    console.log('Items Found: ' + count);
    
    if (count !== '0' && result.item) {
      console.log('\nResults:');
      for (let i = 0; i < Math.min(3, result.item.length); i++) {
        const item = result.item[i];
        console.log('  ' + (i + 1) + '. $' + item.sellingStatus[0].currentPrice[0].__value__ + ' - ' + item.title[0].substring(0, 60));
      }
      
      console.log('\n✓ SUCCESS! eBay API is working correctly.');
      
      return res.json({
        success: true,
        message: 'API working correctly',
        itemsFound: count,
        acknowledgement: ack
      });
    } else {
      console.log('\n✓ API call succeeded but no items found');
      return res.json({
        success: true,
        message: 'API working but no results',
        itemsFound: '0',
        acknowledgement: ack
      });
    }
    
  } catch (error) {
    console.error('\n✗✗✗ ERROR OCCURRED ✗✗✗');
    console.error('Message: ' + error.message);
    
    if (error.response) {
      console.error('\nHTTP Status: ' + error.response.status);
      console.error('Response Headers:');
      console.error(JSON.stringify(error.response.headers, null, 2));
      console.error('\nResponse Body:');
      console.error(JSON.stringify(error.response.data, null, 2));
      
      return res.status(error.response.status).json({
        success: false,
        error: error.message,
        httpStatus: error.response.status,
        ebayResponse: error.response.data
      });
    } else if (error.request) {
      console.error('\nNo response received from eBay');
      console.error('Request was made but no response');
      
      return res.status(500).json({
        success: false,
        error: 'No response from eBay',
        details: error.message
      });
    } else {
      console.error('\nError setting up request');
      console.error(error.message);
      
      return res.status(500).json({
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
