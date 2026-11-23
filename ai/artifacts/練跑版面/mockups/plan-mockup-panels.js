const workspace = document.querySelector('.secondary-grid');
workspace.innerHTML = `
<section class="panel workspace-panel" id="coach" aria-labelledby="coach-title">
  <header class="row"><h2 id="coach-title">教練建議</h2><span class="subtle">W20 · 11/16–11/22</span></header>
  <div class="section-stack">
    <div class="coach-callout"><strong>這週維持輕鬆強度</strong><p>安排 3 堂、主課共 25 km。週六 12 km 長跑是本週重點，並練習比賽補給。</p></div>
    <h3>本週安排</h3>
    <ul class="detail-list">
      <li><span>週二 · 恢復跑</span><strong>6 km · HR ≤145</strong></li>
      <li><span>週四 · 輕鬆跑</span><strong>7 km · HR ≤150</strong></li>
      <li><span>週六 · 輕鬆長跑</span><strong>12 km · HR ≤150</strong></li>
    </ul>
    <details class="panel-detail"><summary>這樣安排的依據</summary>
      <dl class="fact-list"><div><dt>週期目標</dt><dd>賽前收整，維持有氧與長跑連續性。</dd></div><div><dt>課表來源</dt><dd>11/17 確認的 W20 教練週報。</dd></div><div><dt>實跑來源</dt><dd>Garmin 全程紀錄，最新一筆為 11/17。</dd></div><div><dt>調整條件</dt><dd>若出現不適、步態改變或恢復不足，查看當天處方中的縮短或休息安排。</dd></div></dl>
    </details>
    <details class="panel-detail"><summary>歷史週報與教練記憶</summary><p>按週查看當時的處方、實跑證據與回報。完整資料隨正式頁面的週次選擇載入。</p></details>
    <details class="panel-detail"><summary>課程配對與提早安排</summary><p>可核對 Garmin 活動與當日課表、手動修正配對，或查看下一週安排的條件和預覽。</p></details>
  </div>
</section>
<section class="panel workspace-panel" id="assessment" aria-labelledby="assessment-title">
  <header class="row"><h2 id="assessment-title">週評估</h2><span class="subtle">W20 · 示意表單</span></header>
  <form class="section-stack" id="preview-checkin">
    <fieldset><legend>完成度與恢復</legend><div class="checkin-options">
      <label><input type="checkbox"> 本週所有訓練都完成了</label>
      <label><input type="checkbox"> 身體無異常疲勞或疼痛</label>
      <label><input type="checkbox"> 睡眠品質良好</label>
      <label><input type="checkbox"> 長跑結束後隔天恢復正常</label>
      <label><input type="checkbox"> 節奏跑／間歇配速達標</label>
    </div></fieldset>
    <fieldset><legend>本週感受</legend><div class="checkin-options">
      <label for="preview-fatigue">整體疲勞 <output id="preview-fatigue-value" for="preview-fatigue">3</output> / 5</label><input id="preview-fatigue" type="range" min="1" max="5" value="3">
      <label for="preview-note">給教練的備註</label><textarea id="preview-note" rows="2"></textarea>
      <label class="safety-option"><input type="checkbox"> 本週有疼痛或步態異常</label>
    </div></fieldset>
    <button class="primary" type="submit">預覽提交結果</button>
    <p class="subtle" id="preview-feedback" role="status"></p>
    <details class="panel-detail"><summary>歷史評估與調整</summary><p>可切換週次，回顧當時的評估結果、疲勞與課表調整。</p></details>
  </form>
</section>
<section class="panel workspace-panel" id="records" aria-labelledby="records-title">
  <header class="row"><h2 id="records-title">進度與紀錄</h2><span class="subtle">資料至 11/17</span></header>
  <div class="record-switch" role="group" aria-label="紀錄分類">
    <button type="button" data-record-view="activities" aria-pressed="true">Garmin 實跑</button>
    <button type="button" data-record-view="trend" aria-pressed="false">趨勢分析</button>
    <button type="button" data-record-view="cycle" aria-pressed="false">訓練週期</button>
  </div>
  <div class="section-stack" data-record-panel="activities">
    <div class="totals"><div><span>全程實跑</span><strong>6.5 <small>km</small></strong></div><div><span>本週主課計畫</span><strong>25 <small>km</small></strong></div></div>
    <details class="panel-detail" id="run-report"><summary><span>11/17 · 輕鬆跑</span><strong>6.5 km</strong></summary>
      <dl class="fact-list"><div><dt>全程實跑</dt><dd>6.5 km · Garmin</dd></div><div><dt>對應主課</dt><dd>6 km · 恢復 E 跑</dd></div><div><dt>課表強度</dt><dd>心率上限 145 bpm</dd></div></dl>
      <details class="panel-detail"><summary>分圈與跑後判讀</summary>
        <p class="subtle">分圈欄位示意，數值待 Garmin 資料載入。</p>
        <table class="split-preview"><thead><tr><th scope="col">區段</th><th scope="col">配速</th><th scope="col">平均心率</th><th scope="col">步頻</th></tr></thead>
          <tbody><tr><th scope="row">熱身</th><td>—</td><td>—</td><td>—</td></tr><tr><th scope="row">主課</th><td>—</td><td>—</td><td>—</td></tr><tr><th scope="row">收操</th><td>—</td><td>—</td><td>—</td></tr></tbody>
        </table>
        <p>有分段資料時，可核對主課前後段差異與教練判讀。</p>
      </details>
      <details class="panel-detail"><summary>查看或修正課程配對</summary><p>目前示意為 11/17 的正式課程。實作後沿用原有手動配對操作。</p></details>
    </details>
  </div>
  <div class="section-stack" data-record-panel="trend" hidden>
    <h3>跑量與配速</h3>
    <div class="trend-preview" aria-label="週跑量圖表示意，資料為模擬">
      <div class="row"><strong>每週全程實跑</strong><span class="subtle">歷史週為示意</span></div>
      <div class="trend-row"><span>W17</span><meter min="0" max="32" value="26">26 km</meter><strong>26 km</strong></div>
      <div class="trend-row"><span>W18</span><meter min="0" max="32" value="29">29 km</meter><strong>29 km</strong></div>
      <div class="trend-row"><span>W19</span><meter min="0" max="32" value="21">21 km</meter><strong>21 km</strong></div>
      <div class="trend-row"><span>W20</span><meter min="0" max="32" value="6.5">6.5 km</meter><strong>6.5 km</strong></div>
    </div>
    <details class="panel-detail"><summary>月跑量與同心率配速</summary><p>月跑量沿用完整歷史，配速趨勢依可比較的實跑呈現。</p></details>
    <details class="panel-detail"><summary>查看半馬估計與依據</summary><p>完整報告保留估計區間、可比較的長跑與賽事樣本，以及信心限制。草圖不填入推估數字。</p></details>
    <details class="panel-detail"><summary>訓練負荷與恢復指標</summary><p>保留既有的週增幅、步頻、爬升、負荷、睡眠及 HRV 資料入口。</p></details>
  </div>
  <div class="section-stack" data-record-panel="cycle" hidden>
    <h3>半馬 21K</h3>
    <dl class="fact-list"><div><dt>目前階段</dt><dd>第 20 / 22 週 · 半馬收整</dd></div><div><dt>目標日</dt><dd>12/06</dd></div><div><dt>目標配速</dt><dd>6:24/km</dd></div></dl>
    <details class="panel-detail"><summary>週期階段、歷史課表及賽事檢查</summary><p>沿用原有週期時間軸、歷史週課表及賽事檢查，也保留全週期切換。</p></details>
  </div>
</section>`;

const recordButtons = [...workspace.querySelectorAll('[data-record-view]')];
function selectRecordView(view) {
  recordButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.recordView === view)));
  workspace.querySelectorAll('[data-record-panel]').forEach(panel => { panel.hidden = panel.dataset.recordPanel !== view; });
}
recordButtons.forEach(button => button.addEventListener('click', () => selectRecordView(button.dataset.recordView)));

const fatigue = document.getElementById('preview-fatigue');
fatigue.addEventListener('input', () => { document.getElementById('preview-fatigue-value').value = fatigue.value; });
document.getElementById('preview-checkin').addEventListener('submit', event => {
  event.preventDefault();
  document.getElementById('preview-feedback').textContent = '預覽已完成。這頁的輸入只用於草圖。';
});
