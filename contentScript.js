// contentScript.js
(() => {
  // すでにGoogle検索ページでなければ何もしない
  if (!location.href.includes("https://www.google.com/search")) {
    return;
  }

  // DOMを解析し、検索結果とヒット件数を取得する
  let parseResults = () => {
    // 検索結果のヒット数を「約 〇〇 件」などから取得（要DOM構造確認）
    let totalHitCount = 0;
    let resultStats = document.getElementById("result-stats");
    // 新しいUIで result-stats が消えた場合はクラス名やCSSセレクタ対応が必要
    if (resultStats) {
      let match = resultStats.innerText.replace(/\s/g, "").match(/約?([\d,]+)/);
      if (match && match[1]) {
        totalHitCount = parseInt(match[1].replace(/,/g, ""), 10);
      }
    }

    let QA_count = 0;
    let QA_highestRank = null;
    let Blog_count = 0;
    let Blog_highestRank = null;
    let SNS_count = 0;
    let SNS_highestRank = null;
    let sns_details = {
      Tiktok: 0,
      Instagram: 0,
      X: 0,
      Facebook: 0,
      Youtube: 0,
      Twitch: 0,
    };

    // 検索結果一覧（1ページ最大10件）
    // GoogleのDOM構造によって異なるため、実際の要素を確認してクラス名を修正
    let searchItems = document.querySelectorAll("div.g");
    let rank = 1;
    for (let item of searchItems) {
      let linkElem = item.querySelector("a");
      if (!linkElem) continue;
      let displayLink = (linkElem.hostname || "").toLowerCase();

      // Q&Aサイトかどうかチェック
      if (QA_SITES.some((domain) => displayLink.includes(domain))) {
        QA_count++;
        if (QA_highestRank === null || rank < QA_highestRank) {
          QA_highestRank = rank;
        }
      }

      // ブログサイトかどうかチェック
      if (BLOG_SITES.some((domain) => displayLink.includes(domain))) {
        Blog_count++;
        if (Blog_highestRank === null || rank < Blog_highestRank) {
          Blog_highestRank = rank;
        }
      }

      // SNSサイトかどうかチェック
      for (let [snsName, domains] of Object.entries(SNS_SITES)) {
        if (domains.some((domain) => displayLink.includes(domain))) {
          sns_details[snsName]++;
          SNS_count++;
          if (SNS_highestRank === null || rank < SNS_highestRank) {
            SNS_highestRank = rank;
          }
        }
      }
      rank++;
    }

    // 解析結果をまとめる
    const result = {
      totalHitCount,
      QA_count,
      QA_highestRank,
      Blog_count,
      Blog_highestRank,
      SNS_count,
      SNS_highestRank,
      sns_details,
    };

    // background.js に送信
    chrome.runtime.sendMessage({
      type: "DOM_PARSED",
      payload: result,
    });
  };

  // 適宜タイミングを少し遅らせてDOM取得
  setTimeout(parseResults, 1500);
})();
