const axios = require('axios');
const cheerio = require('cheerio');
const { httpsAgent, determineType, generateId, isRecentJob } = require('../utils');
// 引用學校地點資料庫
const { inferLocation } = require('../data/schools.js');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 智慧標題解析器
function parseTitle(fullTitle) {
    // 移除 [徵才]、【公告】等前綴
    let cleanTitle = fullTitle.replace(/^【.*?】/, '').replace(/^\[.*?\]/, '').trim();

    const schoolPatterns = [
        /^(.*?中央研究院)/, /^(.*?中研院)/,
        /^(.*?國家衛生研究院)/, /^(.*?國衛院)/,
        /^(.*?科技大學)/, /^(.*?技術學院)/,
        /^(.*?醫學大學)/, /^(.*?師範大學)/, /^(.*?教育大學)/,
        /^(.*?大學)/, /^(.*?學院)/,
        /^(.*?專科學校)/, /^(.*?高中)/, /^(.*?高職)/
    ];

    let school = '';
    let dept = '';
    let found = false;

    for (const pattern of schoolPatterns) {
        const match = cleanTitle.match(pattern);
        if (match) {
            school = match[1];
            let remaining = cleanTitle.substring(school.length).trim();
            
            // 清理開頭
            remaining = remaining.replace(/^[-\s]+/, '')
                                 .replace(/^(?:誠徵|徵求|徵聘|徵|聘|約聘|招募|公告|啟事|甄選)\s*/, '');
            
            // 策略 A: 優先抓取 "系/所/中心" 結尾的單位 (優先度高)
            const unitMatch = remaining.match(/^(.+?(?:學位學程|學程|系|所|學院|中心|處|室|組|科|部|醫院))/);
            
            // 策略 B: 動詞切割 (後備)
            const splitMatch = remaining.match(/^(.*?)(?:誠徵|徵求|徵聘|徵|聘|約聘|招募|公告|啟事|甄選|人員)/);
            
            if (unitMatch && unitMatch[1].length < 25) { // 稍微放寬長度限制
                dept = unitMatch[1].trim();
            } else if (splitMatch && splitMatch[1].length > 1) {
                dept = splitMatch[1].trim();
            } else if (unitMatch) {
                dept = unitMatch[1].trim();
            } else {
                dept = "詳見標題";
            }
            
            found = true;
            break;
        }
    }

    if (!found) {
        school = "國科會"; 
        dept = "詳見標題";
    }

    return { school, dept };
}

async function fetchNSTC(existingIdSet = new Set()) {
    console.log('🔍 開始掃描國科會 (NSTC)...');
    
    let allNewJobs = [];
    let page = 1;
    let keepGoing = true;
    const MAX_PAGES = 5; 
    const baseUrl = 'https://www.nstc.gov.tw';

    while (keepGoing && page <= MAX_PAGES) {
        const targetUrl = `https://www.nstc.gov.tw/folksonomy/list/ba3d22f3-96fd-4adf-a078-91a05b8f0166?l=ch&pageSize=20&pageNum=${page}`;
        console.log(`   ➳ [NSTC] 正在讀取第 ${page} 頁...`);

        try {
            const { data } = await axios.get(targetUrl, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' 
                },
                httpsAgent
            });
            
            const $ = cheerio.load(data);
            let pageJobs = []; 
            let newInThisPage = 0; 

            $('.news_list > a').each((i, el) => {
                const linkEl = $(el);
                const h3 = linkEl.find('h3');
                
                if (h3.find('.news_top').length > 0) return;

                const title = h3.clone().children().remove().end().text().trim();

                if (title.includes("免責聲明") || title.includes("詐騙")) return;

                const dateRaw = linkEl.find('.date').text().trim();
                const date = dateRaw; 

                const href = linkEl.attr('href');
                const link = href ? (href.startsWith('http') ? href : baseUrl + href) : targetUrl;

                const { school, dept } = parseTitle(title);
                
                // 自動推論地點
                const location = inferLocation(school);
                const tags = location ? [location] : [];

                const id = generateId(school, title, date);

                if (title && isRecentJob(date)) {
                    const jobData = {
                        id,
                        title,
                        school,
                        dept,
                        date,
                        deadline: '-', 
                        type: determineType(title),
                        source: 'NSTC',
                        link,
                        tags: tags 
                    };

                    pageJobs.push(jobData);
                    if (!existingIdSet.has(id)) newInThisPage++;
                }
            });

            if (pageJobs.length > 0) allNewJobs = [...allNewJobs, ...pageJobs];
            
            console.log(`      [NSTC] 第 ${page} 頁：${pageJobs.length} 筆 (新: ${newInThisPage})`);
            
            if (pageJobs.length === 0) {
                keepGoing = false;
            } else if (newInThisPage === 0 && existingIdSet.size > 0) {
                console.log('      [NSTC] 這一頁全部都是舊資料，停止翻頁。');
                keepGoing = false;
            } else {
                page++;
                await sleep(1000); 
            }

        } catch (error) {
            console.error(`❌ [NSTC] 第 ${page} 頁讀取失敗:`, error.message);
            keepGoing = false;
        }
    }
    console.log(`✅ NSTC 掃描結束: 共 ${allNewJobs.length} 筆資料`);
    return allNewJobs;
}

module.exports = fetchNSTC;