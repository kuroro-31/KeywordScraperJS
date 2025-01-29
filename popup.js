// popup.js
document.addEventListener("DOMContentLoaded", () => {
  const keywordInput = document.getElementById("keywordInput");
  const startBtn = document.getElementById("startBtn");
  const statusEl = document.getElementById("status");
  const resultsContainer = document.getElementById("results-container");

  // 分析結果を蓄積して表示する
  let collectedResults = [];

  // background.js からのメッセージを受け取って結果表示を更新
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "ANALYSIS_UPDATE") {
      const { currentKeyword, progressText } = message.payload;
      statusEl.textContent = `現在処理中: ${currentKeyword}\n${progressText}`;
    } else if (message.type === "ANALYSIS_RESULT") {
      const { keywordResult } = message.payload;
      // 結果を保存
      collectedResults.push(keywordResult);

      // 結果を簡易表示
      const line = JSON.stringify(keywordResult);
      const p = document.createElement("p");
      p.textContent = line;
      resultsContainer.appendChild(p);
    } else if (message.type === "ANALYSIS_FINISHED") {
      statusEl.textContent = "全キーワードの分析が完了しました。";
    }
  });

  // 「分析開始」ボタン押下でキーワードを background.js に送信
  startBtn.addEventListener("click", () => {
    const rawText = keywordInput.value.trim();
    if (!rawText) {
      statusEl.textContent = "キーワードが入力されていません。";
      return;
    }
    // 1行ずつ分割し、空行などは除去
    let keywords = rawText
      .split("\n")
      .map((k) => k.trim())
      .filter((k) => k.length > 1);

    // 事前に表示リセット
    collectedResults = [];
    resultsContainer.innerHTML = "";
    statusEl.textContent = "キーワード分析を開始します...";

    // background.jsに分析リクエストを送る
    chrome.runtime.sendMessage({
      type: "START_ANALYSIS",
      payload: { keywords },
    });
  });
});
