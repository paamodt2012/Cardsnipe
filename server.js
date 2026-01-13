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
      'Cade Cunningham', 'Jalen Green', 'Evan Mobley', 'Alperen Sengun', 'Jalen Wi
