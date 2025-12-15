const https = require('https');

// 忽略 SSL 憑證錯誤
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// 職缺分類邏輯 (更新版)
function determineType(title) {
  const t = title.toLowerCase();
  
  // 1. 博士後 (最高優先)
  if (t.includes('博士後') || t.includes('postdoc') || t.includes('post-doc')) return 'postdoc';
  
  // 2. 研究助理/行政 (次高優先)
  // [修正] 增加對 "行政" 的優先排除。如果標題是 "專任行政人員"，它應該在這一關被處理掉。
  // 這裡我們把 "行政" 歸類為 other (或是 assistant，看您需求)，但重點是不能讓它漏下去變成 faculty
  if (t.includes('行政') || t.includes('職員') || t.includes('專員') || t.includes('組員') || t.includes('書記')) {
      // 除非它是 "行政助理"，我們歸類為 assistant，否則歸為 other
      if (t.includes('助理')) return 'assistant';
      return 'other';
  }

  // 2.5 研究助理 (排除上述行政職後的純研究助理)
  if (
      (t.includes('研究助理') || t.includes('assistant') || t.includes('研究人員') || t.includes('researcher') || t.includes('兼任助理')) ||
      (t.includes('專任助理') && !t.includes('教授'))
  ) {
       return 'assistant';
  }

  // 3. 專任教職 (Faculty)
  // 邏輯：只要有 "專任" 且非 "編制外"、非 "專任助理"，就視為教職優先
  // [修正] 增加對 "專任(案)" 的支援。其實目前的邏輯 `t.includes('專任')` 已經包含 "專任(案)"，
  // 因為字串裡確實有 "專任"。重點是後面的 Project 判斷也要能抓到 "(案)"。
  if (t.includes('專任') && !t.includes('編制外') && !t.includes('專任助理')) {
      return 'faculty';
  }

  // 4. 專案/約聘 (Project)
  // [修正] 增加 "(案)" 的判斷
  if (t.includes('專案') || t.includes('約聘') || t.includes('編制外') || t.includes('project') || t.includes('contract') || t.includes('(案)') || t.includes('（案）')) return 'project';

  // 5. 兼任 (Adjunct)
  if (t.includes('兼任') || t.includes('part-time') || t.includes('adjunct')) return 'adjunct';
  
  // 6. 隱性教職 (Faculty)
  if (
      (t.includes('教授') || t.includes('faculty') || t.includes('teacher') || t.includes('講師') || t.includes('師資') || t.includes('教師') || t.includes('專業技術人員'))
  ) {
      return 'faculty';
  }
  
  // 7. 其他
  return 'other'; 
}

// 產生唯一 ID
function generateId(school, title, date) {
  const cleanTitle = title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ''); 
  const raw = `${school}|${cleanTitle}|${date}`;
  return Buffer.from(raw).toString('base64');
}

// 判斷近期職缺
function isRecentJob(dateString) {
    if (!dateString) return false;
    const today = new Date();
    const jobDate = new Date(dateString);
    const diffTime = Math.abs(today - jobDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays <= 7; 
}

module.exports = {
    httpsAgent,
    determineType,
    generateId,
    isRecentJob
};