// background.js

// 分析対象のキーワードリスト
let keywordQueue = [];
let currentIndex = 0;

// キーワードを順番に処理するフロー
async function processKeywords(keywords) {
  const chunks = [];
  for (let i = 0; i < keywords.length; i += 5) {
    chunks.push(keywords.slice(i, i + 5));
  }

  const totalKeywords = keywords.length;
  let processedCount = 0;

  try {
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) {
        // インターバル待機中のメッセージを表示
        for (let waitTime = 20; waitTime > 0; waitTime--) {
          chrome.runtime.sendMessage({
            type: "ANALYSIS_UPDATE",
            payload: {
              currentKeyword: "インターバル待機中",
              progressText: `次のバッチまで残り${waitTime}秒 (${processedCount}/${totalKeywords}キーワード完了)`,
            },
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      processedCount = await searchKeywords(
        chunks[i],
        processedCount,
        totalKeywords
      );
    }

    // 全ての処理が完了したら完了メッセージを送信
    chrome.runtime.sendMessage({
      type: "ANALYSIS_FINISHED",
    });

    // 完了通知を表示
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png",
      title: "キーワード分析が完了しました",
      message: `${totalKeywords}件のキーワードの分析が完了しました。`,
    });
  } catch (error) {
    console.error("処理エラー:", error);

    if (error.message === "RECAPTCHA_DETECTED") {
      // リキャプチャエラーの場合は既に通知済み
    } else {
      // その他のエラーの場合
      await notifySlack(
        `処理中にエラーが発生しました: ${error.message}`,
        keywords[processedCount],
        processedCount,
        totalKeywords,
        error.url ||
          `https://www.google.com/search?q=${encodeURIComponent(
            keywords[processedCount]
          )}` // 現在のキーワードのURLを生成
      );

      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon48.png",
        title: "エラーが発生しました",
        message: `処理中にエラーが発生しました: ${error.message}`,
      });

      chrome.runtime.sendMessage({
        type: "ANALYSIS_ERROR",
        payload: {
          error: error.message,
          lastKeyword: keywords[processedCount],
          currentCount: processedCount,
          totalCount: totalKeywords,
        },
      });
    }
  }
}

// 検索結果を解析する関数を削除（contentScript.jsに移動）
// searchKeywords関数を修正
async function searchKeywords(keywordChunk, processedCount, totalKeywords) {
  console.log("検索開始:", keywordChunk);
  let localProcessedCount = processedCount;

  for (const keyword of keywordChunk) {
    try {
      console.log("現在の検索キーワード:", keyword);

      // searchSingleKeywordの結果を待つ
      const result = await searchSingleKeyword(
        keyword,
        localProcessedCount,
        totalKeywords
      );
      console.log("キーワード検索完了:", keyword, result);

      // カウンターをインクリメント
      localProcessedCount++;

      // 次のキーワードの前に少し待機
      await new Promise((resolve) => setTimeout(resolve, 3000)); // 3秒待機
    } catch (error) {
      console.error("検索エラー:", error);

      if (error.message === "RECAPTCHA_DETECTED") {
        // リキャプチャ検出時の処理
        await notifySlack(
          "検索が一時停止されました。手動での対応が必要です。",
          keyword,
          localProcessedCount,
          totalKeywords,
          error.url || "URL不明"
        );

        // 通知を表示
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon48.png",
          title: "リキャプチャが検出されました",
          message:
            "検索が一時停止されました。これまでの結果をダウンロードできます。",
        });

        // 中断メッセージを送信
        chrome.runtime.sendMessage({
          type: "RECAPTCHA_INTERRUPT",
          payload: {
            lastKeyword: keyword,
            currentCount: localProcessedCount,
            totalCount: totalKeywords,
          },
        });
        throw error;
      }
      // その他のエラーの場合も上位に伝播
      throw error;
    }
  }
  return localProcessedCount;
}

async function searchSingleKeyword(keyword, processedCount, totalKeywords) {
  // 最初にURLを定義
  const normalUrl =
    "https://www.google.com/search?q=" + encodeURIComponent(keyword);
  const intitleUrl =
    "https://www.google.com/search?q=intitle%3A" + encodeURIComponent(keyword);
  const allintitleUrl =
    "https://www.google.com/search?q=allintitle%3A" +
    encodeURIComponent(keyword);

  try {
    const startTime = Date.now();

    chrome.runtime.sendMessage({
      type: "ANALYSIS_UPDATE",
      payload: {
        currentKeyword: keyword,
        progressText: `処理中: ${
          processedCount + 1
        }/${totalKeywords}キーワード目`,
      },
    });

    // --- 1. 通常検索 ---
    let normalResults = await getSearchResults(
      normalUrl,
      keyword,
      processedCount,
      totalKeywords
    );

    // 各検索の間に十分な待機時間を設定
    await new Promise((resolve) => setTimeout(resolve, 5000)); // 5秒待機

    // --- 2. intitle検索 ---
    let intitleResults = await getSearchResults(
      intitleUrl,
      keyword,
      processedCount,
      totalKeywords
    );

    await new Promise((resolve) => setTimeout(resolve, 5000)); // 5秒待機

    // --- 3. allintitle検索 ---
    let allintitleResults = await getSearchResults(
      allintitleUrl,
      keyword,
      processedCount,
      totalKeywords
    );

    const endTime = Date.now();
    const processingTime = ((endTime - startTime) / 1000).toFixed(1);

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
      処理時間: `${processingTime}秒`,
    };

    // ポップアップへ結果を送信
    chrome.runtime.sendMessage({
      type: "ANALYSIS_RESULT",
      payload: {
        keywordResult,
        progressInfo: {
          current: processedCount + 1,
          total: totalKeywords,
          processingTime,
        },
      },
    });

    return keywordResult;
  } catch (error) {
    console.error("検索エラー:", error);

    // エラーオブジェクトにURLを追加
    error.url = normalUrl; // 現在の検索URL

    if (error.message === "RECAPTCHA_DETECTED") {
      await handleRecaptchaError(
        keyword,
        processedCount,
        totalKeywords,
        normalUrl // 現在の検索URL
      );
    }
    throw error;
  }
}

// リキャプチャ検出時のSlack通知関数
async function notifySlack(
  message,
  keyword = "",
  processedCount = 0,
  totalKeywords = 0,
  errorUrl = ""
) {
  console.log("Slack通知開始:", {
    message,
    keyword,
    processedCount,
    totalKeywords,
    errorUrl,
  });

  try {
    const result = await chrome.storage.local.get("slackWebhookUrl");
    const SLACK_WEBHOOK_URL = result.slackWebhookUrl;

    if (!SLACK_WEBHOOK_URL) {
      console.error("Slack Webhook URLが設定されていません");
      return;
    }

    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "🚨 キーワード分析アラート",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${message}*`,
            },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*キーワード:*\n${keyword || "不明"}`,
              },
              {
                type: "mrkdwn",
                text: `*進捗状況:*\n${processedCount}/${totalKeywords} キーワード完了`,
              },
              {
                type: "mrkdwn",
                text: `*発生時刻:*\n${new Date().toLocaleString("ja-JP")}`,
              },
              {
                type: "mrkdwn",
                text: `*URL:*\n${errorUrl || "不明"}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack通知エラー: ${response.status}`);
    }

    console.log("Slack通知成功:", await response.text());
  } catch (error) {
    console.error("Slack通知エラー:", error);
  }
}

// Google検索URLを開き、contentScriptからDOM解析結果を受け取る
function getSearchResults(searchUrl, keyword, processedCount, totalKeywords) {
  return new Promise((resolve, reject) => {
    let isResolved = false;

    chrome.tabs.create({ url: searchUrl, active: false }, (tab) => {
      const onMessageListener = (message, sender, sendResponse) => {
        if (isResolved) return;
        if (message.type === "DOM_PARSED" && sender.tab.id === tab.id) {
          isResolved = true;
          let data = message.payload;
          chrome.tabs.remove(tab.id);
          chrome.runtime.onMessage.removeListener(onMessageListener);
          resolve(data);
        } else if (
          message.type === "RECAPTCHA_DETECTED" &&
          sender.tab.id === tab.id
        ) {
          isResolved = true;
          chrome.tabs.remove(tab.id);
          chrome.runtime.onMessage.removeListener(onMessageListener);
          reject(new Error("RECAPTCHA_DETECTED"));
        }
      };

      // タブの読み込み完了を監視
      chrome.tabs.onUpdated.addListener(function onUpdated(tabId, changeInfo) {
        if (tabId === tab.id && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(onUpdated);

          // DOM解析のための待機時間
          setTimeout(() => {
            if (!isResolved) {
              // タイムアウト処理
              setTimeout(() => {
                if (!isResolved) {
                  isResolved = true;
                  chrome.tabs.remove(tab.id);
                  chrome.runtime.onMessage.removeListener(onMessageListener);
                  reject(new Error("TIMEOUT"));
                }
              }, 30000); // 30秒のタイムアウト
            }
          }, 3000); // 3秒の初期待機
        }
      });

      chrome.runtime.onMessage.addListener(onMessageListener);
    });
  });
}

// reCAPTCHAページを検出する関数を修正
function isRecaptchaPage(url, html) {
  return (
    url.includes("google.com/sorry/") || // Google sorry ページの検出を追加
    html.includes("g-recaptcha") ||
    html.includes("recaptcha") ||
    (html.includes("このページについて") &&
      html.includes("通常と異なるトラフィックが検出されました"))
  );
}

// manifest.json で webRequest 権限が必要
chrome.webRequest?.onCompleted?.addListener(
  function (details) {
    if (details.type === "main_frame") {
      chrome.tabs.get(details.tabId, function (tab) {
        if (
          tab &&
          (tab.url.includes("google.com/sorry/") ||
            tab.url.includes("/recaptcha/") ||
            (tab.url.includes("google.com/search") &&
              details.statusCode === 429))
        ) {
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon48.png",
            title: "reCAPTCHA検出",
            message:
              "Googleの検索でreCAPTCHAが表示されています。手動での対応が必要です。",
          });

          try {
            chrome.tabs.sendMessage(details.tabId, {
              type: "RECAPTCHA_DETECTED",
              message: "リキャプチャが検出されました",
            });
          } catch (error) {
            console.error("タブへのメッセージ送信エラー:", error);
          }

          chrome.runtime.sendMessage({
            type: "RECAPTCHA_INTERRUPT",
          });

          // Slackに通知（URLを追加）
          notifySlack(
            "Googleの検索でreCAPTCHAが表示されています。手動での対応が必要です。",
            keywordQueue[currentIndex],
            currentIndex,
            keywordQueue.length,
            tab.url // URLを追加
          );
        }
      });
    }
  },
  { urls: ["*://*.google.com/*"] }
);

// popup.js からの分析開始指示を受け取る
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START_ANALYSIS") {
    keywordQueue = msg.payload.keywords;
    currentIndex = 0;
    processKeywords(keywordQueue);
  }
});

// リキャプチャ検出時のメッセージ処理を修正
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RECAPTCHA_DETECTED") {
    // Slackに通知
    notifySlack(
      "リキャプチャが検出されました。手動での対応が必要です。",
      message.keyword || "不明",
      message.currentCount || 0,
      message.totalCount || 0,
      message.errorUrl || ""
    );

    // ポップアップに通知
    chrome.runtime.sendMessage({
      type: "RECAPTCHA_INTERRUPT",
      payload: {
        lastKeyword: message.keyword,
        currentCount: message.currentCount,
        totalCount: message.totalCount,
        errorUrl: message.errorUrl,
      },
    });
  }
  // 他のメッセージ処理...
});

// reCAPTCHAエラーハンドリング関数
async function handleRecaptchaError(
  keyword,
  processedCount,
  totalKeywords,
  url
) {
  try {
    await notifySlack(
      "検索が一時停止されました。手動での対応が必要です。",
      keyword,
      processedCount,
      totalKeywords,
      url
    );

    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png", // アイコンファイルの存在を確認
      title: "リキャプチャが検出されました",
      message:
        "検索が一時停止されました。これまでの結果をダウンロードできます。",
    });

    chrome.runtime.sendMessage({
      type: "RECAPTCHA_INTERRUPT",
      payload: {
        lastKeyword: keyword,
        currentCount: processedCount,
        totalCount: totalKeywords,
      },
    });
  } catch (error) {
    console.error("reCAPTCHAエラーハンドリング中のエラー:", error);
  }
}
