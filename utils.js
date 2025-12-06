const https = require('https');

// 忽略 SSL 憑證錯誤 (許多學校或政府網站憑證過期常發生)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// 職缺分類邏輯
function determineType(title) {
  const t = title.toLowerCase();
  if (t.includes('教授') || t.includes('專任') || t.includes('faculty') || t.includes('teacher') || t.includes('講師')) return 'faculty';
  if (t.includes('博士後') || t.includes('postdoc') || t.includes('post-doc')) return 'postdoc';
  if (t.includes('研究助理') || t.includes('行政') || t.includes('assistant') || t.includes('工讀') || t.includes('專員')) return 'assistant';
  return 'other'; // 預設
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