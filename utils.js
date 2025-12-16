const https = require('https');

// 忽略 SSL 憑證錯誤 (許多學校或政府網站憑證過期常發生)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// 職缺分類邏輯 (更新版: 調整優先權，避免誤判)
function determineType(title) {
  const t = title.toLowerCase();
  
  // 1. 博士後 (最高優先)
  if (t.includes('博士後') || t.includes('postdoc') || t.includes('post-doc')) return 'postdoc';
  
  // 2. 研究助理/研究人員 (次高優先)
  // [修正] 針對 "研究人員" 進行更嚴格的關鍵字匹配
  // 避免 "博士後研究人員" 雖然第一關過了，但如果有其他類似 "研究人員" 的詞彙又被抓回來 (雖然理論上 return 後不會)
  // 重點是擴充研究人員的組合
  
  const isResearchAssistant = 
      t.includes('研究助理') || 
      t.includes('assistant') || 
      t.includes('兼任助理') ||
      (t.includes('專任助理') && !t.includes('教授'));

  // [新增] 擴充研究人員的判定，必須符合特定組合
  const isResearcher = 
      t.includes('級研究人員') ||
      t.includes('專任研究人員') ||
      t.includes('專案研究人員') ||
      t.includes('編制內研究人員') ||
      t.includes('編制外研究人員') ||
      t.includes('researcher');

  if (isResearchAssistant || isResearcher) {
      // 再次確認排除行政人員 (除非是 "行政助理")
      if (!t.includes('行政') || t.includes('行政助理')) {
           return 'assistant';
      }
  }

  // 3. 專任教職 (Faculty) - 優先權調整
  // 邏輯：只要有 "專任" 且非 "編制外"、非 "專任助理"，就視為教職優先
  // 這能涵蓋 "專任或專案"、"專任/約聘" (雖然含約聘，但有專任機會)
  if (t.includes('專任') && !t.includes('編制外') && !t.includes('專任助理')) {
      return 'faculty';
  }

  // 4. 專案/約聘 (Project)
  // 這裡剩下的就是 "專案教師"、"專案經理" 等
  // 注意：這裡只回傳 project，但如果是 "專案教師"，後續在前端可能會有雙重標籤，這是允許的
  // 但為了符合您的需求 "不被歸類進去"，如果是單一回傳值的邏輯，這裡會先回傳 project
  if (t.includes('專案') || t.includes('約聘') || t.includes('編制外') || t.includes('project') || t.includes('contract')) return 'project';

  // 5. 兼任 (Adjunct)
  if (t.includes('兼任') || t.includes('part-time') || t.includes('adjunct')) return 'adjunct';
  
  // 6. 隱性教職 (Faculty)
  // 沒有寫 "專任"，但有職稱，且前面沒被專案/兼任抓走
  if (
      (t.includes('教授') || t.includes('faculty') || t.includes('teacher') || t.includes('講師') || t.includes('師資') || t.includes('教師') || t.includes('專業技術人員') || t.includes('教學人員'))
  ) {
      return 'faculty';
  }
  
  // 7. 其他
  return 'other'; 
}

// 產生唯一 ID (指紋)
function generateId(school, title, date) {
  // 移除標點符號與空白，避免微小差異造成重複
  const cleanTitle = title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ''); 
  const raw = `${school}|${cleanTitle}|${date}`;
  return Buffer.from(raw).toString('base64');
}

// 判斷是否為近期職缺 (例如抓取最近 7 天內的)
function isRecentJob(dateString) {
    if (!dateString) return false;
    const today = new Date();
    const jobDate = new Date(dateString);
    
    const diffTime = Math.abs(today - jobDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    
    return diffDays <= 7; 
}

// 匯出這些功能給其他檔案使用
module.exports = {
    httpsAgent,
    determineType,
    generateId,
    isRecentJob
};