// background.js

// 分析対象のキーワードリスト
let keywordQueue = [];
let currentIndex = 0;

// キーワードを順番に処理するフロー
async function processKeywords() {
  if (currentIndex >= keywordQueue.length) {
    // 全キーワード完了
    chrome.runtime.sendMessage({
      type: "ANALYSIS_FINISHED",
    });
    return;
  }

  const keyword = keywordQueue[currentIndex];
  chrome.runtime.sendMessage({
    type: "ANALYSIS_UPDATE",
    payload: {
      currentKeyword: keyword,
      progressText: `${currentIndex + 1} / ${keywordQueue.length}`,
    },
  });

  // --- 1. 通常検索 ---
  let normalUrl =
    "https://www.google.com/search?q=" + encodeURIComponent(keyword);
  let normalResults = await getSearchResults(normalUrl);

  // --- 2. intitle検索 ---
  let intitleUrl =
    "https://www.google.com/search?q=intitle%3A" + encodeURIComponent(keyword);
  let intitleResults = await getSearchResults(intitleUrl);

  // --- 3. allintitle検索 ---
  let allintitleUrl =
    "https://www.google.com/search?q=allintitle%3A" +
    encodeURIComponent(keyword);
  let allintitleResults = await getSearchResults(allintitleUrl);

  // 取得結果を集約
  let keywordResult = {
    Keyword: keyword,
    allintitle件数: allintitleResults?.totalHitCount || 0,
    intitle件数: intitleResults?.totalHitCount || 0,
    "Q&A件数": normalResults?.QA_count || 0,
    "Q&A最高順位": normalResults?.QA_highestRank || null,
    無料ブログ件数: normalResults?.Blog_count || 0,
    ブログ最高順位: normalResults?.Blog_highestRank || null,
    SNS件数: normalResults?.SNS_count || 0,
    SNS最高順位: normalResults?.SNS_highestRank || null,
    sns_details: normalResults?.sns_details || {},
  };

  // ポップアップへ結果を送信
  chrome.runtime.sendMessage({
    type: "ANALYSIS_RESULT",
    payload: { keywordResult },
  });

  // 次のキーワードへ
  currentIndex++;
  // 連続で叩くとGoogleにブロックされやすいので適宜待機を入れる
  setTimeout(() => {
    processKeywords();
  }, 2000); // 2秒待機など
}

// Google検索URLを開き、contentScriptからDOM解析結果を受け取る
function getSearchResults(searchUrl) {
  return new Promise((resolve, reject) => {
    // 新規タブ作成
    chrome.tabs.create({ url: searchUrl, active: false }, (tab) => {
      // タブがロード完了したらcontentScript側が解析→メッセージ送信する想定
      const onMessageListener = (message, sender, sendResponse) => {
        if (message.type === "DOM_PARSED" && sender.tab.id === tab.id) {
          // 結果を受け取る
          let data = message.payload;
          // タブを閉じる
          chrome.tabs.remove(tab.id);
          // このリスナーは不要なので削除
          chrome.runtime.onMessage.removeListener(onMessageListener);
          resolve(data);
        }
      };
      chrome.runtime.onMessage.addListener(onMessageListener);
    });
  });
}

// popup.js からの分析開始指示を受け取る
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START_ANALYSIS") {
    keywordQueue = msg.payload.keywords;
    currentIndex = 0;
    processKeywords();
  }
});
