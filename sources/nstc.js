const axios = require('axios');
const cheerio = require('cheerio');
const { httpsAgent, determineType, generateId, isRecentJob } = require('../utils');
// 引用學校地點資料庫 (假設你的專案結構中有 data/schools.js，若無則使用內建推論)
// 為了確保獨立運作，這裡保留內建推論函式，但建議搭配 data/schools.js 使用
let inferLocation = (name) => '';
try {
    const schoolsData = require('../data/schools.js');
    if (schoolsData && schoolsData.inferLocation) {
        inferLocation = schoolsData.inferLocation;
    }
} catch (e) {
    // console.log("Note: data/schools.js not found, location inference might be limited.");
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 智慧標題解析器
function parseTitle(fullTitle) {
    // 1. 清理標題：移除 【】 [] () 等括號，替換為空白，避免黏在一起
    // 例如 "【國立中興大學-食品系】" -> " 國立中興大學-食品系 "
    let cleanTitle = fullTitle.replace(/[【】\[\]()（）]/g, ' ').trim();

    // 2. 學校關鍵字清單 (注意順序：長詞優先)
    const schoolPatterns = [
        /^(.*?中央研究院)/, /^(.*?中研院)/,
        /^(.*?國家衛生研究院)/, /^(.*?國衛院)/,
        /^(.*?國家實驗研究院)/, /^(.*?國研院)/,
        /^(.*?科技大學)/, /^(.*?技術學院)/,
        /^(.*?醫學大學)/, /^(.*?師範大學)/, /^(.*?教育大學)/,
        /^(.*?大學)/, /^(.*?學院)/,
        /^(.*?專科學校)/, /^(.*?高中)/, /^(.*?高職)/,
        // 加入常見簡稱
        /^(.*?台大)/, /^(.*?清大)/, /^(.*?陽明交大)/, /^(.*?交大)/, /^(.*?成大)/, 
        /^(.*?政大)/, /^(.*?中央)/, /^(.*?中興)/, /^(.*?中山)/, /^(.*?中正)/, 
        /^(.*?師大)/, /^(.*?高醫)/, /^(.*?中國醫)/, /^(.*?中山醫)/, /^(.*?北醫)/
    ];

    let school = '';
    let dept = '';
    let found = false;

    for (const pattern of schoolPatterns) {
        const match = cleanTitle.match(pattern);
        if (match) {
            // 抓出學校名稱 (trim 掉多餘空白)
            school = match[1].trim();
            
            // 剩下的部分用來找系所
            // 移除學校名稱，並清理開頭的連接符 (- / \ 空白)
            let remaining = cleanTitle.substring(cleanTitle.indexOf(school) + school.length).trim();
            remaining = remaining.replace(/^[-\s\/\\|]+/, '')
                                 .replace(/^(?:誠徵|徵求|徵聘|徵|聘|約聘|招募|公告|啟事|甄選|禮聘)\s*/, '');
            
            // 策略 A: 優先抓取 "系/所/中心/處/室" 結尾的單位
            // 允許中間有空白 (例如 "國際事務處")
            const unitMatch = remaining.match(/^(.+?(?:學位學程|學程|系|所|學院|中心|處|室|組|科|部|醫院))/);
            
            // 策略 B: 動詞切割 (後備)
            const splitMatch = remaining.match(/^(.*?)(?:誠徵|徵求|徵聘|徵|聘|約聘|招募|公告|啟事|甄選|人員|禮聘)/);
            
            if (unitMatch && unitMatch[1].length < 30) {
                dept = unitMatch[1].trim();
            } else if (splitMatch && splitMatch[1].length > 1) {
                dept = splitMatch[1].trim();
            } else if (unitMatch) {
                dept = unitMatch[1].trim();
            } else {
                dept = "詳見標題";
            }
            
            // 修正系所名稱：如果抓到的系所還包含 "-" 或空白開頭，再修一次
            dept = dept.replace(/^[-\s]+/, '');

            found = true;
            break;
        }
    }

    if (!found) {
        school = "國科會"; 
        dept = "詳見標題";
    }

    // 正規化學校名稱 (把簡稱轉全稱，讓地點推論更準)
    if (school === '台大') school = '國立臺灣大學';
    if (school === '成大') school = '國立成功大學';
    if (school === '清大') school = '國立清華大學';
    if (school === '政大') school = '國立政治大學';
    if (school === '中興') school = '國立中興大學';
    // ... 其他簡稱可視需求加入

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

                // 取得原始標題
                const rawTitle = h3.clone().children().remove().end().text().trim();

                // 基本過濾
                if (rawTitle.includes("免責聲明") || rawTitle.includes("詐騙")) return;

                const dateRaw = linkEl.find('.date').text().trim();
                const date = dateRaw; 

                const href = linkEl.attr('href');
                const link = href ? (href.startsWith('http') ? href : baseUrl + href) : targetUrl;

                // 使用強化版解析器
                const { school, dept } = parseTitle(rawTitle);
                
                // 推論地點
                const location = inferLocation(school);
                const tags = location ? [location] : [];

                const id = generateId(school, rawTitle, date);

                if (rawTitle && isRecentJob(date)) {
                    const jobData = {
                        id,
                        title: rawTitle, // 標題保留原始的比較好讀
                        school,
                        dept,
                        date,
                        deadline: '-', 
                        type: determineType(rawTitle),
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