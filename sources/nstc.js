const axios = require('axios');
const cheerio = require('cheerio');
const { httpsAgent, determineType, generateId, isRecentJob } = require('../utils');

async function fetchNSTC() {
  // console.log('🔍 正在掃描國科會 (NSTC)... (目前為佔位符)');
  // 未來在這裡實作國科會的抓取邏輯
  // const url = '...';
  // ... logic ...
  
  const jobs = [];
  return jobs;
}

module.exports = fetchNSTC;