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

      // CSVダウンロードボタンを追加
      const downloadButton = document.createElement("button");
      downloadButton.textContent = "CSVダウンロード";
      downloadButton.addEventListener("click", () => {
        const csvContent = convertToCSV(collectedResults);
        const blob = new Blob([csvContent], {
          type: "text/csv;charset=utf-8;",
        });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `keyword_analysis_${new Date()
          .toISOString()
          .slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
      });
      resultsContainer.appendChild(downloadButton);
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

function downloadCSV(data) {
  const csvContent = convertToCSV(data);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `analysis_result_${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function convertToCSV(results) {
  // ヘッダー行を作成
  const headers = [
    "キーワード",
    "allintitle件数",
    "intitle件数",
    "Q&A件数",
    "Q&A最高順位",
    "無料ブログ件数",
    "ブログ最高順位",
    "SNS件数",
    "SNS最高順位",
  ];

  // データ行を作成
  const rows = results.map((result) => [
    result.Keyword,
    result.allintitle件数,
    result.intitle件数,
    result["Q&A件数"],
    result["Q&A最高順位"],
    result.無料ブログ件数,
    result.ブログ最高順位,
    result.SNS件数,
    result.SNS最高順位,
  ]);

  // ヘッダーとデータを結合してCSV形式に変換
  return [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n");
}

// 分析結果を表示する関数を更新
function displayResults(results) {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  results.forEach((result) => {
    const resultItem = document.createElement("div");
    resultItem.textContent = `${result.url}: ${result.result}`;
    resultsDiv.appendChild(resultItem);
  });

  // ダウンロードボタンを追加
  const downloadButton = document.createElement("button");
  downloadButton.textContent = "CSVダウンロード";
  downloadButton.addEventListener("click", () => downloadCSV(results));
  resultsDiv.appendChild(downloadButton);
}
